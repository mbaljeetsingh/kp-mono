"""The aligner's core — windows in, line timings out — importable.

write_timings.py aligns published renditions from their own cut audio;
scan_track.py aligns its drafts from the recording's transcript, so a draft
arrives with its lyrics already timed. Both go through here, so they can never
align two different ways. Everything that survived measurement is documented
in docs/line-alignment-prototype.md.
"""

import statistics

import align
import matcher
from runtime import banidb

WIN, HOP = 15.0, 5.0
SHORT_WIN, SHORT_HOP, ALPHA = 8.0, 2.0, 0.5
# FLOOR is per model, not per matcher: CTC text is rougher than surt's, so
# every line scores a little lower and surt's 0.40 blanked real singing —
# 80% on one benchmark recording against surt's 93%. At 0.35 the shipped path
# scores 96.2% over the benchmark (surt at its own settings: 96.4%).
BLEND, FLOOR = 0.4, 0.35

# Added to every window's start and end before matching — never stored, so the
# cached transcripts keep raw times and re-tuning this costs no ASR. Even the
# per-window short pass lands transitions a little early under the CTC model;
# the shift chosen held-out (on the other three benchmark recordings each time)
# was +0.5 to +1.0s, and applying it took boundary MAE from 1.38s to 1.10s.
SHIFT = 0.75


def shifted(windows):
    """SHIFT applied, with ends clamped to the audio: the raw grid's last end
    IS the duration, and a window past it would push the frame grid — and
    every timing derived from it — beyond the end of the rendition."""
    dur = max((w["end"] for w in windows), default=0.0)
    return [{**w, "start": min(w["start"] + SHIFT, dur),
             "end": min(w["end"] + SHIFT, dur)} for w in windows]


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


def shabad_lines(shabad_id):
    """(verses, lines, cand) for a shabad: BaniDB's verses, {line_idx, text}
    per line, and the indices of the lines that are sung (headings dropped)."""
    shabad = banidb(f"/shabads/{shabad_id}")
    verses, info = shabad["verses"], shabad["shabadInfo"]
    lines = [{"line_idx": i,
              "text": v["verse"].get("unicode") or v["verse"]["gurmukhi"]}
             for i, v in enumerate(verses)]
    return verses, lines, matcher.candidate_lines(lines, info)


def confidence(windows, lines, cand):
    """Mean best-line match over every long window: the gate's number
    (correct tags 0.82-0.92, a wrong shabad ~0.52)."""
    return statistics.mean(
        max(align.score(w["text"], lines[j]["text"], True) for j in cand)
        for w in windows)


def line_timings(windows, short_windows, verses, lines, cand, off, end,
                 video_id="x"):
    """Rendition-relative windows (already shifted) -> absolute line timings,
    [{verse_id, start, end}] in track seconds. Two-scale with crossing
    refinement when short windows are given, single scale otherwise."""
    span = max(w["end"] for w in windows)
    case = {"video_id": video_id, "uem": {"start": 0, "end": span},
            "lines": lines}
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
    return timings
