"""The aligner's core — a recording's transcript in, line timings out.

Both scripts read one transcript per recording: scan_track.py aligns its drafts
on their span of it, so a draft arrives with its lyrics already timed, and
write_timings.py aligns a published rendition on its own span. Whichever needs
a recording first transcribes it, once. Both go through here, so they can never
align two different ways, nor on two different window grids. Everything that
survived measurement is documented in docs/line-alignment-prototype.md.
"""

import json
import os
import statistics
import subprocess
import time

import soundfile as sf

import align
import matcher
import runtime
from runtime import SR, banidb

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
CACHE = "cache"
# A fetched recording shorter than this share of what ffprobe reads from
# sgpc.net was cut short. Measured on six recordings: the decoded length was
# ffprobe's exactly, or up to 0.5% longer, never shorter.
WHOLE = 0.98


def duration(url):
    """The recording's length in seconds as ffprobe reads it from sgpc.net, or
    None when it cannot tell."""
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                              "format=duration", "-of", "csv=p=0", url],
                             capture_output=True, text=True, timeout=60,
                             check=True).stdout
        return float(out)
    except Exception:
        return None


def _save(path, payload):
    """Written whole or not at all: a run killed mid-write must not leave half
    a file that every later run on the machine reads first and chokes on."""
    with open(f"{path}.part", "w") as f:
        json.dump(payload, f, ensure_ascii=False)
    os.replace(f"{path}.part", path)


def transcribe(track_id, url, store=True, timings=None, asr=True):
    """Both of align's passes over the whole recording, cached per track.

    (long, short) windows in track seconds, raw — shifted is applied per span,
    by within. Keys name the model and how the text was cut, like every other
    transcript key, and never a rendition's edges: a re-cut or a re-tag reads
    the same transcript again. `store=False` keeps them on local disk only
    (eval_scan.py and a dry run point at prod and must not write to it);
    `timings`, when given, receives fetch/asr seconds and the duration for
    whatever this call actually transcribed. `asr=False` answers from the
    caches alone — None if either pass would need the model."""
    os.makedirs(CACHE, exist_ok=True)
    keys = {"long": f"{track_id}_{WIN:g}s{HOP:g}s_{runtime.SLICED_TAG}",
            "short": f"{track_id}_{SHORT_WIN:g}s{SHORT_HOP:g}s_"
                     f"{runtime.WINDOWED_TAG}"}
    out, decoded = {}, []

    def audio():
        # Fetched only past both caches, and decoded once: re-matching an
        # already-scanned archive must not re-download every recording.
        if not decoded:
            wav = f"{CACHE}/track_{track_id}.wav"
            t = time.monotonic()
            if not os.path.exists(wav):
                print("  fetching audio…", flush=True)
                # To a side name, renamed once complete: an interrupted fetch
                # must not leave a wav the next run takes for the recording.
                subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", url,
                                "-ar", str(SR), "-ac", "1", "-f", "wav",
                                f"{wav}.part"], check=True)
                os.replace(f"{wav}.part", wav)
            a = sf.read(wav, dtype="float32")[0]
            # ffmpeg ends a dropped download as if the file had ended, exit 0,
            # and a short transcript is the recording's for good: everything
            # past the cut would read as a mistag, and no re-cut heals it, the
            # key holding no edges. So the audio must be as long as sgpc.net
            # says before any of it is transcribed.
            want = duration(url)
            if want and len(a) / SR < WHOLE * want:
                os.remove(wav)
                raise RuntimeError(f"fetched {len(a) / SR:.0f}s of a "
                                   f"{want:.0f}s recording: the download was "
                                   f"cut short")
            decoded.append(a)
            if timings is not None:
                timings.update(fetch=time.monotonic() - t,
                               duration=len(decoded[0]) / SR, asr=0.0)
        return decoded[0]

    for name, key in keys.items():
        path = f"{CACHE}/track_{key}.json"
        if os.path.exists(path):
            out[name] = json.load(open(path))["windows"]
            continue
        remote = runtime.fetch_transcript(f"track/{key}.json")
        if remote:
            _save(path, remote)
            print(f"  {name} pass: from storage", flush=True)
            out[name] = remote["windows"]
            continue
        if not asr:
            return None
        a = audio()
        t = time.monotonic()
        if name == "long":
            w = runtime.transcribe_sliced(a, WIN, HOP)
        else:
            w = runtime.transcribe_windows(a, SHORT_WIN, SHORT_HOP,
                                           label="short windows")
        if timings is not None:
            timings["asr"] += time.monotonic() - t
        _save(path, {"windows": w})
        if store:
            runtime.store_transcript(f"track/{key}.json", {"windows": w})
        out[name] = w
    return out["long"], out["short"]


def shifted(windows, dur):
    """SHIFT applied, with ends clamped to `dur`, the end of the audio the
    windows came from: a window past it would push the frame grid — and every
    timing derived from it — beyond the end of the span."""
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


def within(windows, t0, t1):
    """The windows wholly inside [t0, t1], rebased to it and shifted: a span's
    own view of the recording's transcript. Clamped to the span, not to the
    last window in it — the audio runs on to t1, and clamping short of it
    left the last window's shift, and the tail with it, unlit."""
    return shifted([{**w, "start": w["start"] - t0, "end": w["end"] - t0}
                    for w in windows
                    if w["start"] >= t0 and w["end"] <= t1], t1 - t0)


def align_span(long_w, short_w, shabad, t0, t1):
    """(confidence, line timings) for [t0, t1] of a recording, read off its
    transcript — a scan draft and a published rendition alike.

    Measured against audio cut at the same edges, its own two passes (what
    write_timings did until #83), on the local stack's 11 published
    renditions: confidence moved +0.008 on average and 0.050 at most (an
    87-second rendition), no rendition crossed MIN_CONFIDENCE either way, and
    the lyrics sat on the same line for 94% of the seconds. Line starts moved
    0.2 s at the median, 3.6 s at the 90th percentile. Only windows wholly
    inside count, so the first line starts 0-3 s later — the price of hearing
    none of the neighbouring audio — and the tail ends within 1 s of where
    cut audio ended it."""
    verses, lines, cand = shabad
    lw, sw = within(long_w, t0, t1), within(short_w, t0, t1)
    if not lw:
        return 0.0, []
    return (confidence(lw, lines, cand),
            line_timings(lw, sw, verses, lines, cand, t0, t1))


def line_timings(windows, short_windows, verses, lines, cand, off, end):
    """Span-relative windows (already shifted) -> absolute line timings,
    [{verse_id, start, end}] in track seconds: both scales, then the crossing
    refinement."""
    # The frame grid is the span, not the long pass's last window: in a slice
    # of a recording that window can end seconds before the span does, and
    # the short pass's evidence after it would never be read.
    case = {"video_id": "x", "uem": {"start": 0, "end": end - off},
            "lines": lines}
    sub = align_two_scale(case, windows, short_windows, cand)
    sub["segments"] = refine_boundaries(sub["segments"], short_windows, lines)

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
