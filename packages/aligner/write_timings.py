"""Align every tagged rendition and write line timings to Postgres.

The batch job, in the form it actually ships as: run it by hand when renditions
get tagged. Each rendition is read off its recording's transcript — align's two
passes over the whole recording, the very ones the scan makes
(timing.transcribe), cached per track on disk and in the transcripts bucket. A
recording nobody has scanned is transcribed here, once; after that a re-cut, a
re-tag or the scan costs seconds of matching. Only the timings reach the
database.

Settings are the ones measurement settled on (see docs/line-alignment-prototype.md):
  two ASR scales + crossing refinement   boundary MAE 0.86s on the benchmark GT
  blend 0.4                              char similarity + IDF word recall
  floor 0.35                             blanks during alaap, no stale lines
  shift +0.75s                           the CTC model hears transitions early

Renditions whose audio does not match their tagged shabad are SKIPPED, not
written. Confidence separates them cleanly — correctly tagged renditions score
0.82-0.92, a mismatch ~0.52 — and writing timings for a wrong shabad would put
confidently wrong highlighting on the renditions people actually watch.

The queue is data: published renditions with a shabad_id and no timings yet.
Alignment deliberately waits for publish — a scan draft is machine-confident,
not human-confirmed, and lyrics are computed for verified tags only.

    SB_KEY=<service key> python write_timings.py [--dry-run] [--limit N] [--all]
"""

import argparse
import time

import timing
from runtime import MIN_CONFIDENCE, SB, api, paged

# The windows, BLEND, FLOOR and SHIFT live in timing.py, shared with
# scan_track.py, which aligns its drafts on the same transcript.

ap = argparse.ArgumentParser()
ap.add_argument("--dry-run", action="store_true",
                help="align but write nothing to the project — no timings, no "
                     "transcript uploads — so it is safe to point at prod; "
                     "what it transcribes stays in the local cache/")
ap.add_argument("--only", help="restrict to one rendition id prefix")
ap.add_argument("--limit", type=int, default=None,
                help="align at most N renditions this run. Bounds the count "
                     "only — pair it with --deadline-min to bound the clock")
ap.add_argument("--all", action="store_true",
                help="re-align renditions that already have timings (matcher "
                     "improved, boundaries re-cut), and say how far each moved "
                     "from its stored timings. Default is new work only")
ap.add_argument("--deadline-min", type=int, default=None,
                help="start no transcription of a recording that would not "
                     "finish within N minutes of the run's start (the run's "
                     "first may use all N). --limit bounds the count; this "
                     "bounds the clock, which is what a CI timeout enforces")
args = ap.parse_args()

# The whole queue, oldest first. It used to come a page at a time — --limit
# plus a few spare rows for refusals, because a refused rendition never leaves
# the queue and every refusal paid ASR, so a page of them starved whatever
# came behind. Now a refusal costs seconds once its recording is transcribed,
# and what an untranscribed recording costs is bounded by the deadline below:
# nothing waits behind them, and a page would only let deferred rows crowd
# cheap ones out of the run.
where = "status=eq.published&shabad_id=not.is.null"
if not args.all:
    where += "&line_timings=is.null"
select = ("id,name,shabad_id,main_verse_id,start_sec,end_sec,track_id,"
          "line_timings,tracks(url)")
todo = paged(f"{SB}/renditions?{where}&select={select}"
             f"&order=created_at.asc,id.asc")

# A dry run is a measurement: it may transcribe, but uploads nothing, so
# pointing one at prod writes nothing there.
store = not args.dry_run

# --only names one rendition and is never cut short, by count or by clock.
limit = args.limit if not args.only else None
timed = args.deadline_min is not None and not args.only


def asr_minutes(url):
    """What transcribing this recording would cost on a runner, at
    timing.CI_RTF.
    None when its length cannot be read."""
    seconds = timing.duration(url)
    return seconds * timing.CI_RTF / 60.0 if seconds else None


def agreement(old, new):
    """Share of the seconds either timing covers on which both name the same
    line: how far a re-time moved a rendition's lyrics, for --all to report."""
    def lines(ts):
        return {s: t["verse_id"] for t in ts
                for s in range(int(t["start"]), int(t["end"]))}
    a, b = lines(old), lines(new)
    seconds = a.keys() | b.keys()
    return (sum(a.get(s) == b.get(s) for s in seconds) / len(seconds)
            if seconds else 1.0)


print(f"{len(todo)} published rendition(s) queued"
      f"{f', aligning at most {limit}' if limit else ''}"
      f"{' (--all: including already-timed)' if args.all else ''}\n")

written = skipped = aligned = deferred = 0
transcribed = False   # whether this run has started a transcription yet
need = {}             # track_id -> projected minutes of ASR, probed once a run
retried = set()       # renditions taken again after changing mid-run
started_at = time.monotonic()
# `todo` grows while this runs (see NOT WRITTEN below), and the loop sees it.
for i, r in enumerate(todo):
    rid = r["id"]
    if args.only and not rid.startswith(args.only):
        continue
    # Never silently: a bounded run that does not say what it left behind reads
    # exactly like a run that found nothing more to do.
    if limit and aligned >= limit:
        print(f"── stopping at --limit {limit}; {len(todo) - i} more "
              f"{'match --all' if args.all else 'still queued'}, left for the "
              f"next run\n")
        break

    off, end = float(r["start_sec"]), float(r["end_sec"])
    tid, url = r["track_id"], r["tracks"]["url"]
    print(f"── {r['name']}  (shabad {r['shabad_id']}, {off:.0f}-{end:.0f}s)")

    # The recording's transcript, if anything has made one: the scan, or an
    # earlier rendition of it. Then this rendition costs seconds of matching,
    # whatever its edges — they are no part of the key.
    transcript = timing.transcribe(tid, url, store=store, asr=False)

    # Without one it pays for the whole recording, ~0.24x its length on a
    # runner — most of an hour for a 3-hour Asa di Vaar. --limit does not
    # bound that; --deadline-min does, and only the clock is what a CI timeout
    # enforces: a run killed at timeout-minutes loses its in-flight ASR. So a
    # transcription starts only if its projection fits the budget — what is
    # left of the deadline, or, for the run's first started before it, all of
    # it: a long recording is not starved by every run, and one too long for
    # any run never starts at all. Each recording is probed once, and none
    # once the budget is spent.
    if transcript is None and timed:
        left = args.deadline_min - (time.monotonic() - started_at) / 60.0
        budget = args.deadline_min if not transcribed and left > 0 else left
        if budget > 0 and tid not in need:
            need[tid] = asr_minutes(url)
        n = need.get(tid)
        if budget <= 0 or n is None or n > budget:
            why = ("no time left in the budget" if budget <= 0 else
                   "its recording's length cannot be read" if n is None else
                   f"its recording needs ~{n:.0f} min of ASR, "
                   f"{budget:.0f} min left")
            print(f"  deferred — {why} ({args.deadline_min}-minute "
                  f"budget)\n")
            deferred += 1
            continue

    if transcript is None:
        print("  transcribing its recording: once, for every rendition and "
              "scan of it", flush=True)
        transcribed = True
        try:
            transcript = timing.transcribe(tid, url, store=store)
        except Exception as e:
            # A recording gone from sgpc.net, a download cut short, a closed
            # socket: this rendition waits for the next run and the queue goes
            # on. Raising stopped every rendition behind it, every run.
            print(f"  deferred — could not transcribe its recording: {e}\n")
            deferred += 1
            continue
    long_w, short_w = transcript

    # Too short to hold one long window of the recording's grid, a span has no
    # confidence to gate on — which is not the wrong shabad, and must not read
    # like it.
    if not timing.within(long_w, off, end):
        print(f"  SKIP — shorter than one {timing.WIN:g}s window of its "
              f"recording's transcript: too short to align\n")
        skipped += 1
        continue

    # Isolated: a shabad that cannot be fetched — retries exhausted, or an id
    # BaniDB does not have — costs this one rendition; letting it raise cost
    # every rendition still queued behind it.
    try:
        shabad = timing.shabad_lines(r["shabad_id"])
    except Exception as e:
        print(f"  SKIP — could not fetch shabad {r['shabad_id']}: {e}\n")
        skipped += 1
        continue
    confidence, timings = timing.align_span(long_w, short_w, shabad, off, end)

    if confidence < MIN_CONFIDENCE:
        print(f"  SKIP — confidence {confidence:.3f} < {MIN_CONFIDENCE}. The "
              f"audio does not match shabad {r['shabad_id']}; the tag needs "
              f"review before this can be aligned.\n")
        skipped += 1
        continue

    aligned += 1
    covered = sum(t["end"] - t["start"] for t in timings)

    print(f"  confidence {confidence:.3f} | {len(timings)} segments | "
          f"{len({t['verse_id'] for t in timings})}/{len(shabad[1])} lines | "
          f"{100 * covered / (end - off):.0f}% covered, "
          f"{100 - 100 * covered / (end - off):.0f}% blank")
    if r.get("line_timings"):
        print(f"  {100 * agreement(r['line_timings'], timings):.0f}% of "
              f"seconds on the same line as its stored timings")

    if args.dry_run:
        for t in timings[:4]:
            print(f"    {t['start']:.0f}-{t['end']:.0f}s  verse {t['verse_id']}")
        print()
        written += 1
        continue

    # Only onto the rendition these timings are for. A re-cut or re-tag since
    # the queue was fetched cleared its timings (requeue_alignment_on_recut)
    # and queued it again; writing these over that would pin lyrics for the
    # old edges on it, and take it out of the queue that would fix them.
    rows = api(f"{SB}/renditions?id=eq.{rid}&start_sec=eq.{r['start_sec']}"
               f"&end_sec=eq.{r['end_sec']}&shabad_id=eq.{r['shabad_id']}"
               f"&select=id", method="PATCH",
               body={"line_timings": timings},
               extra={"Prefer": "return=representation"})
    if rows:
        written += 1
        # Anchor-drift check (issue #36): the dominant sung line is measured
        # anyway, and on every verified rendition so far it has agreed with
        # the human anchor — so a disagreement is worth a line in the log.
        # A note, never a write: the anchor belongs to whoever listened.
        held = {}
        for t in timings:
            held[t["verse_id"]] = held.get(t["verse_id"], 0) \
                + t["end"] - t["start"]
        dominant = max(held, key=held.get) if held else None
        mv = r.get("main_verse_id")
        if mv is not None and dominant is not None and mv != dominant:
            print(f"  note: main_verse_id {mv} is not the most-sung line "
                  f"({dominant}, {held[dominant]:.0f}s) — worth an ear check")
        print("  written\n")
        continue

    # Deleted, re-cut or re-tagged since the queue was fetched — a recording's
    # transcription can take minutes. A re-cut of a row already queued
    # dispatches no run of its own (dispatch_align fires on entering the
    # queue), so take it again now, at its new edges: its recording's
    # transcript is in hand, so that costs seconds. Once — a tagger still
    # nudging it is the next run's.
    fresh = (api(f"{SB}/renditions?id=eq.{rid}&{where}&select={select}")
             if rid not in retried else None)
    if fresh:
        retried.add(rid)
        todo.append(fresh[0])
        print("  NOT WRITTEN — it changed while this run was aligning it; "
              "taking it again at its new edges\n")
    else:
        print("  NOT WRITTEN — the rendition changed or vanished while this "
              "run was aligning it\n")

print(f"{'would write' if args.dry_run else 'wrote'} {written}, "
      f"skipped {skipped}{f', deferred {deferred}' if deferred else ''}")
