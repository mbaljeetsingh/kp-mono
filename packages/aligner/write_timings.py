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
import subprocess
import sys
import time

import timing
from runtime import MIN_CONFIDENCE, SB, api

# The windows, BLEND, FLOOR and SHIFT live in timing.py, shared with
# scan_track.py, which aligns its drafts on the same transcript.

# What transcribing a recording costs per second of its audio, both passes,
# measured on a CI runner (4 vCPU, run 36318552033) rather than estimated:
# sliced long pass RTF 0.075 + per-window short pass 0.164. Rounded up for
# headroom; the audio fetch was 6s per 10 minutes, noise beside it.
# surt-small-v3 measured RTF 9.1 on the same runner — if this number ever
# looks too good, that is the comparison, not a typo.
CI_RTF = 0.3

ap = argparse.ArgumentParser()
ap.add_argument("--dry-run", action="store_true",
                help="align but write nothing anywhere — no timings, no "
                     "transcripts — so it is safe to point at prod")
ap.add_argument("--only", help="restrict to one rendition id prefix")
ap.add_argument("--limit", type=int, default=None,
                help="align at most N renditions this run. Bounds the count "
                     "only — pair it with --deadline-min to bound the clock")
ap.add_argument("--all", action="store_true",
                help="re-align renditions that already have timings (matcher "
                     "improved, boundaries re-cut). Default is new work only")
ap.add_argument("--deadline-min", type=int, default=None,
                help="stop starting renditions once the run would exceed N "
                     "minutes. --limit bounds the count; this bounds the "
                     "clock, which is what a CI timeout actually enforces")
args = ap.parse_args()


# --limit bounds the EXPENSIVE work — renditions that actually get aligned —
# not the rows fetched. The distinction is not pedantic: a rendition refused by
# the confidence gate never gets timings, so it never leaves the queue, and with
# order=created_at.asc it is the oldest row every night thereafter. Counting it
# against the limit permanently retires one of the night's slots. Shabad 3590
# alone would take a --limit 3 night from three alignments to two, which is the
# same starvation that had newly published renditions waiting behind an
# ever-growing backlog.
#
# So over-fetch by a small budget and stop once `limit` renditions have cleared
# the gate. The budget is what keeps the night bounded in the other direction:
# a skip is free once its recording is transcribed, but a mistag on a recording
# nobody has scanned pays for the whole recording on its first night — which
# the deadline below bounds, so a jammed head of the queue costs one
# recording's ASR, not four.
SKIP_BUDGET = 4

# A dry run is a measurement: it may transcribe, but keeps what it hears on
# local disk, so pointing one at prod writes nothing there.
store = not args.dry_run

# The queue's filter, kept apart from the page so queue_depth() can ask about
# the whole thing rather than the slice this run happens to have fetched.
where = "status=eq.published&shabad_id=not.is.null"
if not args.all:
    where += "&line_timings=is.null"

# --only names one rendition; a limit would have it silently match nothing
# whenever the id is not among the oldest few rows fetched. Bounding applies to
# queue-draining runs, not to targeted ones.
bounded = bool(args.limit) and not args.only

q = (f"{SB}/renditions?{where}"
     f"&select=id,name,shabad_id,main_verse_id,start_sec,end_sec,track_id,"
     f"line_timings,tracks(url)"
     f"&order=created_at.asc")
if bounded:
    q += f"&limit={args.limit + SKIP_BUDGET}"
rends = api(q)


def queue_depth():
    """How many renditions are actually waiting.

    Counting what is left from `rends` cannot answer this: the page is capped at
    limit + SKIP_BUDGET, so a 50-deep backlog would report as 4 — a run that is
    falling behind would look identical to one that had nearly caught up, which
    is precisely the signal a bounded run exists to give. Ids only, and only on
    the paths that actually stop early, so the runs that drain the queue pay
    nothing for it.

    Best-effort, like the transcript store: this runs after hours of ASR that is
    already safely written, and a closed socket on a reporting query must not
    turn a night that did its work into a failed job.
    """
    try:
        return str(len(api(f"{SB}/renditions?{where}&select=id") or []))
    except Exception as e:
        print(f"  (queue depth unavailable: {e})", flush=True)
        return "an unknown number of"


def remaining():
    """What is left, worded for the mode.

    Under --all the filter is not a queue at all — every published, tagged
    rendition matches it whether or not it has timings — so counting it and
    calling the result "still queued" would report the same large number after
    every run and never fall.
    """
    if args.all:
        return "more rendition(s) match --all and are"
    return f"{queue_depth()} rendition(s) still"


def asr_minutes(url):
    """What transcribing this recording would cost, at CI_RTF, from ffprobe's
    reading of its length. None when it cannot tell."""
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                              "format=duration", "-of", "csv=p=0", url],
                             capture_output=True, text=True, timeout=60,
                             check=True).stdout
        return float(out) * CI_RTF / 60.0
    except Exception:
        return None


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


print(f"{len(rends)} published rendition(s) fetched"
      f"{f', aligning at most {args.limit}' if bounded else ''}"
      f"{' (--all: including already-timed)' if args.all else ''}\n")

written = skipped = aligned = deferred = 0
transcribed = False
started_at = time.monotonic()
for r in sorted(rends, key=lambda x: x["name"]):
    rid = r["id"]
    if args.only and not rid.startswith(args.only):
        continue
    # Never silently: a bounded run that does not say what it left behind reads
    # exactly like a run that found nothing more to do.
    if bounded and aligned >= args.limit:
        print(f"── stopping at --limit {args.limit}; {remaining()} "
              f"queued for the next run\n")
        break

    off, end = float(r["start_sec"]), float(r["end_sec"])
    tid, url = r["track_id"], r["tracks"]["url"]

    # The recording's transcript, if anything has made one: the scan, or an
    # earlier rendition of it. Then this rendition costs seconds of matching,
    # whatever its edges — they are no part of the key.
    transcript = timing.transcribe(tid, url, store=store, asr=False)

    # --limit bounds the count; --deadline-min bounds the clock, and only the
    # second one is what a CI timeout actually enforces. A rendition on a
    # recording with no transcript pays for the whole recording, ~0.3x its
    # length — most of an hour for a 3-hour Asa di Vaar — and a count does not
    # bound that: the run dies at timeout-minutes with its in-flight ASR thrown
    # away. So project the cost from the recording's length and defer anything
    # that will not fit.
    #
    # `transcribed` in the guard: the first recording a run transcribes is
    # always attempted, so a long one is deferred by later runs rather than
    # starved by every one of them. `continue` rather than `break` because the
    # list is sorted by name, not cost — a rendition further down may be on a
    # recording that already has its transcript.
    if transcript is None and bounded and args.deadline_min is not None \
            and transcribed:
        projected = asr_minutes(url)
        left = args.deadline_min - (time.monotonic() - started_at) / 60.0
        if projected is None or projected > left:
            need = (f"~{projected:.0f} min" if projected is not None
                    else "an unknown time")
            print(f"── deferring {r['name']} — its recording needs {need} of "
                  f"ASR, {max(left, 0):.0f} min left in the {args.deadline_min}-minute "
                  f"budget\n")
            deferred += 1
            continue

    print(f"── {r['name']}  (shabad {r['shabad_id']}, {off:.0f}-{end:.0f}s)")
    if transcript is None:
        print("  no transcript of this recording yet: transcribing all of it, "
              "once", flush=True)
        transcript = timing.transcribe(tid, url, store=store)
        transcribed = True
    long_w, short_w = transcript

    # Isolated, because a recording's transcript can be the run. A shabad that
    # cannot be fetched — retries exhausted, or an id BaniDB does not have —
    # costs this one rendition; letting it raise cost every rendition still
    # queued behind it.
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
    else:
        # Deleted, re-cut or re-tagged between the queue fetch and this write
        # (a recording's transcript can take minutes) — say so instead of
        # counting it.
        print("  NOT WRITTEN — the rendition changed or vanished while this "
              "run was aligning it\n")

print(f"{'would write' if args.dry_run else 'wrote'} {written}, "
      f"skipped {skipped}{f', deferred {deferred}' if deferred else ''}")

# A head-of-queue jam. Refused renditions never get timings, so they never leave
# an order=created_at.asc queue — and once there are as many of them as a page
# holds, every night fetches the same refusals, aligns nothing, and exits 0.
# That is indistinguishable in the logs from an empty queue, and it is exactly
# how newly published renditions end up waiting with nobody knowing why. Say so,
# and fail the job when the page was full, because rows behind it are starving
# and only a human reviewing those tags can clear it.
if rends and not args.only and aligned == 0 and skipped == len(rends):
    print(f"\nJAMMED — all {len(rends)} rendition(s) at the head of the queue "
          f"were refused by the confidence gate. {queue_depth()} rendition(s) "
          f"are queued in total; none can be aligned until those tags are "
          f"reviewed.")
    if not args.dry_run and bounded \
            and len(rends) == args.limit + SKIP_BUDGET:
        sys.exit(1)
