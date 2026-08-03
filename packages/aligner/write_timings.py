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

import soundfile as sf

import align
import matcher
import runtime
from runtime import MIN_CONFIDENCE, SB, SR, api, banidb

WIN, HOP = 15.0, 5.0
SHORT_WIN, SHORT_HOP, ALPHA = 8.0, 2.0, 0.5
BLEND, FLOOR = 0.4, 0.40
CACHE = "cache"

ap = argparse.ArgumentParser()
ap.add_argument("--dry-run", action="store_true", help="align but do not write")
ap.add_argument("--only", help="restrict to one rendition id prefix")
ap.add_argument("--single", action="store_true",
                help="single scale only: 3x cheaper, blurrier boundaries")
ap.add_argument("--limit", type=int, default=None,
                help="align at most N renditions this run — keeps a nightly "
                     "CI job bounded no matter how the queue spikes")
ap.add_argument("--all", action="store_true",
                help="re-align renditions that already have timings (matcher "
                     "improved, boundaries re-cut). Default is new work only")
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


os.makedirs(CACHE, exist_ok=True)
q = (f"{SB}/renditions?status=eq.published&shabad_id=not.is.null"
     f"&select=id,name,shabad_id,start_sec,end_sec,tracks(url)"
     f"&order=created_at.asc")
if not args.all:
    q += "&line_timings=is.null"
if args.limit:
    q += f"&limit={args.limit}"
rends = api(q)
print(f"{len(rends)} published rendition(s) to align"
      f"{' (--all: including already-timed)' if args.all else ''}\n")

written = skipped = 0
for r in sorted(rends, key=lambda x: x["name"]):
    rid = r["id"]
    short = rid[:8]
    if args.only and not rid.startswith(args.only):
        continue
    off, end = float(r["start_sec"]), float(r["end_sec"])
    print(f"── {r['name']}  (shabad {r['shabad_id']}, {off:.0f}-{end:.0f}s)")

    # audio: the whole rendition, straight from sgpc.net. The boundaries are
    # part of the cache key: the wav is cut at fetch time with -ss/-t, so a
    # re-cut rendition MUST miss this cache — reusing the old audio while
    # adding the new offset would shift every timing by the boundary delta.
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
    # Second, shorter pass. Its value is concentrated at transitions, which is
    # invisible to frame accuracy (interiors dominate) but is the only thing a
    # listener perceives: a boundary landing early shows a line before it is
    # sung. Measured boundary jitter without it was +/-5.6s.
    short_windows = pass_at(SHORT_WIN, SHORT_HOP, "short") if not args.single else None

    shabad = banidb(f"/shabads/{r['shabad_id']}")
    verses, info = shabad["verses"], shabad["shabadInfo"]
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
        print("  written\n")
    else:
        # Deleted or re-cut between the queue fetch and this write (an align
        # run takes minutes per rendition) — say so instead of counting it.
        print("  NOT WRITTEN — the rendition changed or vanished while this "
              "run was aligning it\n")

print(f"{'would write' if args.dry_run else 'wrote'} {written}, skipped {skipped}")
