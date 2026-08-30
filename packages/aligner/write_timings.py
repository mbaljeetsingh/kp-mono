"""Align every tagged rendition and write line timings to Postgres.

The batch job, in the form it actually ships as: run it by hand when renditions
get tagged. Audio comes from sgpc.net server-side, transcripts are cached per
rendition on disk, and the only thing that reaches the database is the timings.

Settings are the ones measurement settled on (see docs/line-alignment-prototype.md):
  two ASR scales + crossing refinement   boundary MAE 2.61s, none early >3s
  blend 0.4                              char similarity + IDF word recall
  floor 0.40                             blanks during alaap, no stale lines

Renditions whose audio does not match their tagged shabad are SKIPPED, not
written. Confidence separates them cleanly — correctly tagged renditions score
0.76-0.87, a mismatch ~0.51 — and writing timings for a wrong shabad would put
confidently wrong highlighting on the renditions people actually watch.

The queue is data: published renditions with a shabad_id and no timings yet.
Alignment deliberately waits for publish — a scan draft is machine-confident,
not human-confirmed, and lyrics are computed for verified tags only.

    SB_KEY=<service key> python write_timings.py [--dry-run] [--limit N] [--all]
"""

import argparse
import json
import os
import statistics
import subprocess
import sys
import time

import soundfile as sf

import align
import matcher
import runtime
from runtime import MIN_CONFIDENCE, SB, SR, api, banidb

WIN, HOP = 15.0, 5.0
SHORT_WIN, SHORT_HOP, ALPHA = 8.0, 2.0, 0.5
BLEND, FLOOR = 0.4, 0.40
CACHE = "cache"

# Cost of a run, measured on a CI runner rather than estimated. Whisper pads
# every clip to a fixed 30s mel input, so cost is per ASR WINDOW (~9s each), not
# per second of audio; the two passes emit D/5 + D/2 windows, so a rendition
# costs ~6x its duration. Apple Silicon manages ~0.83 — never budget CI off that
# number, which is the mistake that cancelled two nights. See README.
CI_RTF = 6.0

ap = argparse.ArgumentParser()
ap.add_argument("--dry-run", action="store_true", help="align but do not write")
ap.add_argument("--only", help="restrict to one rendition id prefix")
ap.add_argument("--single", action="store_true",
                help="single scale only: 3x cheaper, blurrier boundaries")
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


def transcribe(wav, win, hop):
    """Sliding-window ASR. Each window decoded independently — the transcript's
    position in time is which window produced it, never Whisper's timestamps."""
    pipe = runtime.load_pipe()
    audio, _ = sf.read(wav, dtype="float32")
    dur = len(audio) / SR
    starts, clips = [], []
    t = 0.0
    while (t + 1) * SR < len(audio):
        starts.append(t)
        clips.append(audio[int(t * SR):int((t + win) * SR)])
        t += hop
    texts = []
    for i in range(0, len(clips), 4):
        texts.extend(o["text"].strip() for o in
                     pipe(clips[i:i + 4], generate_kwargs=runtime.GEN,
                          batch_size=4))
        runtime.free_accelerator()
        print(f"    {len(texts)}/{len(clips)} windows", end="\r", flush=True)
    print()
    # Clamp to the real audio length. The final window starts less than `win`
    # from the end, so recording it as a full `win` wide pushes every derived
    # timing past the end of the rendition.
    return [{"start": s, "end": min(s + win, dur), "text": tx}
            for s, tx in zip(starts, texts)]



def frames_of(windows, lines, n):
    """Frame-level [n][n_lines] evidence from one ASR pass."""
    rows = matcher.score_matrix(windows, lines, BLEND)
    return matcher.accumulate_frames(windows, rows, n, len(lines))


def align_two_scale(case, long_w, short_w, cand):
    """Long window transcribes better, short window localises better."""
    lines = case["lines"]
    n = int(case["uem"]["end"]) + 2
    a_l, c_l = frames_of(long_w, lines, n)
    a_s, c_s = frames_of(short_w, lines, n)
    lab = []
    for t in range(n):
        if not c_l[t] and not c_s[t]:
            lab.append(-1)
            continue
        comb = []
        for j in range(len(lines)):
            if not c_s[t]:
                comb.append(a_l[t][j])
            elif not c_l[t]:
                comb.append(a_s[t][j])
            else:
                comb.append((1 - ALPHA) * a_l[t][j] + ALPHA * a_s[t][j])
        b = max(cand, key=lambda j: comb[j])
        lab.append(b if comb[b] >= FLOOR else -1)
    return {"video_id": case["video_id"],
            "segments": align.labels_to_segments(lab)}


def refine_boundaries(segments, short_windows, lines):
    """Sharpen each line transition with the crossing method.

    The frame argmax places a boundary wherever averaged evidence tips, which
    smears it by every window overlapping it — measured jitter ±5.6s single
    scale, ±4.6s two-scale. But for a KNOWN transition A→B the best estimate is
    where score(B) − score(A) crosses zero across the short-pass windows. The
    same method located true boundaries when used as a measuring instrument, so
    here it is as the estimator. Uses only cached windows; no new ASR.
    """
    segs = [dict(s) for s in segments]
    centers = [((w["start"] + w["end"]) / 2.0, w["text"]) for w in short_windows]
    for a, b in zip(segs, segs[1:]):
        if a["line_idx"] == b["line_idx"]:
            continue
        # Only contiguous transitions: across a gap the two edges are real
        # (singing stopped, then a new line began) and should stay put.
        if b["start"] - a["end"] > 2.0:
            continue
        t0 = (a["end"] + b["start"]) / 2.0
        ta, tb = lines[a["line_idx"]]["text"], lines[b["line_idx"]]["text"]
        pts = sorted((c, align.score(tx, tb, True) - align.score(tx, ta, True))
                     for c, tx in centers if abs(c - t0) <= 10.0)
        if len(pts) < 4:
            continue
        # 3-point moving average, then the first negative→positive crossing.
        sm = [(pts[i][0],
               sum(p[1] for p in pts[max(0, i - 1):i + 2])
               / len(pts[max(0, i - 1):i + 2]))
              for i in range(len(pts))]
        cross = None
        for (c1, d1), (c2, d2) in zip(sm, sm[1:]):
            if d1 < 0 <= d2:
                # interpolate the zero between the two centers
                cross = c1 + (c2 - c1) * (-d1 / (d2 - d1)) if d2 != d1 else c1
                break
        if cross is None:
            continue
        # Never move a boundary out of either segment's interior.
        lo = a["start"] + 1.0
        hi = b["end"] - 1.0
        if not (lo < cross < hi):
            continue
        a["end"] = b["start"] = round(cross, 2)
    return segs


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
# a skip is cheap only once its transcript is cached, and a mistag's FIRST night
# still pays a full pass (~23 min for a 12-minute set). limit 3 + budget 4 is a
# worst case of roughly 5 hours, inside timeout-minutes.
SKIP_BUDGET = 4

os.makedirs(CACHE, exist_ok=True)

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
     f"&select=id,name,shabad_id,main_verse_id,start_sec,end_sec,tracks(url)"
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


print(f"{len(rends)} published rendition(s) fetched"
      f"{f', aligning at most {args.limit}' if bounded else ''}"
      f"{' (--all: including already-timed)' if args.all else ''}\n")

written = skipped = aligned = deferred = 0
started_at = time.monotonic()
for r in sorted(rends, key=lambda x: x["name"]):
    rid = r["id"]
    short = rid[:8]
    if args.only and not rid.startswith(args.only):
        continue
    # Never silently: a bounded run that does not say what it left behind reads
    # exactly like a run that found nothing more to do.
    if bounded and aligned >= args.limit:
        print(f"── stopping at --limit {args.limit}; {remaining()} "
              f"queued for the next run\n")
        break

    off, end = float(r["start_sec"]), float(r["end_sec"])

    # --limit bounds the count; --deadline-min bounds the clock, and only the
    # second one is what a CI timeout actually enforces. Three half-hour
    # renditions is ~9 hours at RTF 6 — a count of three does not stop that, and
    # the run dies at timeout-minutes with its in-flight ASR thrown away. So
    # project the cost from the duration and defer anything that will not fit.
    #
    # The projection assumes a full two-pass ASR. A rendition whose transcripts
    # are already banked costs far less than this, so the budget defers some
    # work that would in fact have fit — deliberately conservative, because
    # over-deferring costs one night's delay while under-deferring costs a run
    # cancelled at timeout-minutes with its in-flight ASR thrown away.
    #
    # `aligned` in the guard: the first rendition of a run is always attempted,
    # so an unusually long one is deferred by later runs rather than starved by
    # every one of them. `continue` rather than `break` because the list is
    # sorted by name, not duration — a shorter rendition further down may still
    # fit in what is left of the budget.
    projected = (end - off) * CI_RTF / 60.0
    left = (args.deadline_min or 0) - (time.monotonic() - started_at) / 60.0
    if bounded and args.deadline_min is not None and aligned \
            and projected > left:
        print(f"── deferring {r['name']} — needs ~{projected:.0f} min, "
              f"{left:.0f} min left in the {args.deadline_min}-minute budget\n")
        deferred += 1
        continue

    print(f"── {r['name']}  (shabad {r['shabad_id']}, {off:.0f}-{end:.0f}s)")

    # audio: the whole rendition, straight from sgpc.net. The boundaries are
    # part of the cache key: the wav is cut at fetch time with -ss/-t, so a
    # re-cut rendition MUST miss this cache — reusing the old audio while
    # adding the new offset would shift every timing by the boundary delta.
    #
    # Which means a re-cut is NOT cheap, whatever else you may have read. The
    # requeue_alignment_on_recut trigger (20260804000100_functions.sql) carries
    # a note saying re-alignment after a boundary change costs "seconds of
    # matching, not minutes of ASR, because transcripts are cached". That claim
    # is wrong and cannot be corrected in place — the migration is applied in
    # production, and this repo only rewrites migrations while no database has
    # them. So the correction lives here, next to the cache key that causes it:
    # a re-cut pays a full two-pass ASR, ~6x the rendition's duration on a CI
    # runner. Shabad 4248, re-cut 180-555 -> 171-516, re-transcribed from
    # scratch for 35 minutes on 29 Aug. Correct behaviour, but not free — and it
    # spends one of the night's --limit slots.
    cut = f"{short}_{off:.0f}_{end:.0f}"
    wav = f"{CACHE}/{cut}.wav"
    if not os.path.exists(wav):
        print("  fetching audio", flush=True)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", str(off),
                        "-t", str(end - off), "-i", r["tracks"]["url"],
                        "-ar", str(SR), "-ac", "1", wav], check=True)

    def pass_at(win, hop, tag):
        p = f"{CACHE}/{cut}_{tag}_asr.json"
        if os.path.exists(p):
            return json.load(open(p))["windows"]
        # Disk missed — the bucket is the disk that survives a CI runner.
        remote = runtime.fetch_transcript(f"align/{cut}_{tag}.json")
        if remote:
            json.dump(remote, open(p, "w"), ensure_ascii=False)
            print(f"  ASR pass {win:g}s/{hop:g}s: from storage", flush=True)
            return remote["windows"]
        print(f"  ASR pass {win:g}s/{hop:g}s", flush=True)
        w = transcribe(wav, win, hop)
        json.dump({"windows": w}, open(p, "w"), ensure_ascii=False)
        runtime.store_transcript(f"align/{cut}_{tag}.json", {"windows": w})
        return w

    windows = pass_at(WIN, HOP, "full")

    # Isolated, because this is the first thing after the ASR and the ASR is
    # the run. A shabad that cannot be fetched — retries exhausted, or an id
    # BaniDB does not have — costs this one rendition; letting it raise cost
    # every rendition still queued behind it.
    try:
        shabad = banidb(f"/shabads/{r['shabad_id']}")
        verses, info = shabad["verses"], shabad["shabadInfo"]
    except Exception as e:
        print(f"  SKIP — could not fetch shabad {r['shabad_id']}: {e}\n")
        skipped += 1
        continue
    lines = [{"line_idx": i,
              "text": v["verse"].get("unicode") or v["verse"]["gurmukhi"]}
             for i, v in enumerate(verses)]
    cand = matcher.candidate_lines(lines, info)

    confidence = statistics.mean(
        max(align.score(w["text"], lines[j]["text"], True) for j in cand)
        for w in windows)

    if confidence < MIN_CONFIDENCE:
        print(f"  SKIP — confidence {confidence:.3f} < {MIN_CONFIDENCE}. The "
              f"audio does not match shabad {r['shabad_id']}; the tag needs "
              f"review before this can be aligned.\n")
        skipped += 1
        continue

    aligned += 1

    # Second, shorter pass. Its value is concentrated at transitions, which is
    # invisible to frame accuracy (interiors dominate) but is the only thing a
    # listener perceives: a boundary landing early shows a line before it is
    # sung. Measured boundary jitter without it was +/-5.6s.
    #
    # Deliberately AFTER the two gates above, not beside the full pass. At
    # hop 2 it is 5/7 of the windows and two thirds of the runtime, and nothing
    # before this point reads it: confidence scores `windows` alone. Running it
    # first meant a mistagged rendition — which never leaves the queue, so it is
    # retried every night — paid the whole ASR before being refused. Now it pays
    # the full pass only. The full pass is already banked to the bucket by
    # pass_at, so a shabad fetch that fails transiently still costs nothing the
    # next run has to redo.
    short_windows = pass_at(SHORT_WIN, SHORT_HOP, "short") if not args.single else None

    span = max(w["end"] for w in windows)
    case = {"video_id": short, "uem": {"start": 0, "end": span}, "lines": lines}
    if short_windows:
        sub = align_two_scale(case, windows, short_windows, cand)
        sub["segments"] = refine_boundaries(sub["segments"], short_windows,
                                            lines)
    else:
        sub = matcher.align_case(case, {"windows": windows}, BLEND,
                                 FLOOR, cand=cand)

    # Rendition-relative -> absolute seconds into the track, so re-cutting the
    # rendition's boundaries later does not shift every line.
    # Clamped to the rendition, belt-and-braces against the frame grid running
    # a second or two past the last window.
    timings = [t for t in
               ({"verse_id": verses[s["line_idx"]]["verseId"],
                 "start": round(min(off + s["start"], end), 2),
                 "end": round(min(off + s["end"], end), 2)}
                for s in sub["segments"] if s["end"] - s["start"] >= 2)
               if t["end"] - t["start"] >= 2]
    covered = sum(t["end"] - t["start"] for t in timings)

    print(f"  confidence {confidence:.3f} | {len(timings)} segments | "
          f"{len({t['verse_id'] for t in timings})}/{len(lines)} lines | "
          f"{100 * covered / (end - off):.0f}% covered, "
          f"{100 - 100 * covered / (end - off):.0f}% blank")

    if args.dry_run:
        for t in timings[:4]:
            print(f"    {t['start']:.0f}-{t['end']:.0f}s  verse {t['verse_id']}")
        print()
        continue

    rows = api(f"{SB}/renditions?id=eq.{rid}&select=id", method="PATCH",
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
        # Deleted or re-cut between the queue fetch and this write (an align
        # run takes minutes per rendition) — say so instead of counting it.
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
