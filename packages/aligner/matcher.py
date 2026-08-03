"""The aligner, consolidated: everything that survived measurement.

What survived
  - phonetic folding of both sides                          (+0.5pt)
  - flat average over covering windows                      (beat triangular)
  - char similarity blended with IDF-weighted word recall    (+0.9pt)
  - per-frame argmax with a null floor                       (beat an HMM)

What did not
  - HMM with monotonic-antra / anchor-return transitions     (-10pt)
  - triangular window weighting                              (-0.5pt)
  - centre-cropping window text                              (-1pt)
  - any constant time shift                                  (flat)
"""

import math
import re

from rapidfuzz import fuzz

import align

# Structural lines that are printed but not sung: raag/author headings
# ("<raag> ਮਹਲਾ ੫ ॥"), the mool mantar opener, and section markers.
#
# Position is not a reliable test. In most shabads verses[0] is the heading,
# but in others — shabad 3590 among the tagged renditions — verses[0] is real
# sung content and is what the tagger anchored main_verse_id to. Excluding
# index 0 unconditionally makes that line impossible to predict.
_HEADER_RE = re.compile(r"ਮਹਲਾ|ਮਃ|ੴ|ਸਲੋਕੁ|ਪਉੜੀ|ਸੁਧੁ|ਰਾਗੁ|ਅਸਟਪਦੀ|ਛੰਤੁ")
_STRIP = re.compile(r"[॥।\d੦-੯]+")


# Vocabulary that can only belong to a caption line, beyond the per-shabad
# raag/writer metadata: the invocation and the metre/section markers.
_STRUCTURAL = {
    "ੴ", "ਸਤਿਗੁਰ", "ਪ੍ਰਸਾਦਿ", "ਸਤਿ", "ਨਾਮੁ", "ਕਰਤਾ", "ਪੁਰਖੁ", "ਨਿਰਭਉ",
    "ਨਿਰਵੈਰੁ", "ਅਕਾਲ", "ਮੂਰਤਿ", "ਅਜੂਨੀ", "ਸੈਭੰ", "ਗੁਰ", "ਗੁਰੁ",
    "ਰਾਗੁ", "ਰਾਗ", "ਮਹਲਾ", "ਮਃ", "ਘਰੁ", "ਘਰ", "ਚਉਪਦੇ", "ਦੁਪਦੇ", "ਤਿਪਦੇ",
    "ਅਸਟਪਦੀ", "ਅਸਟਪਦੀਆ", "ਛੰਤ", "ਛੰਤੁ", "ਸਲੋਕੁ", "ਸਲੋਕ", "ਪਉੜੀ", "ਵਾਰ",
    "ਸੁਧੁ", "ਜਉ", "ਕੀ", "ਕਾ", "ਕੇ",
}


def heading_vocab(shabad_info):
    """Folded tokens that mark a caption line, for one shabad."""
    vocab = set(_STRUCTURAL)
    for key in ("raag", "writer", "source"):
        blob = (shabad_info or {}).get(key) or {}
        for field in ("unicode", "gurmukhi", "akhar"):
            val = blob.get(field)
            if isinstance(val, str):
                vocab.update(val.split())
    return {f for f in (align.fold(w) for w in vocab) if f}


def is_header(text, vocab=None):
    """A caption line is one built entirely from metadata, not a short one.

    Word count looked clean on the benchmark and is wrong on real data, in both
    directions. In shabad 4214 the sung verse [10] folds to 2 tokens while the
    mangal heading [1] folds to 3 — no threshold separates them, and excluding
    a real verse makes it unpredictable forever.

    Containment classifies all eight shabads tested correctly, and its failure
    mode is the safe one: an unrecognised heading merely competes in the pool,
    whereas an excluded verse can never win.

    Falls back to the old length heuristic only when no metadata is supplied.
    """
    toks = align.fold(text).split()
    if not toks:
        return True
    if vocab is not None:
        return all(t in vocab for t in toks)
    words = _STRIP.sub(" ", text).split()
    return len(words) <= 2 or (len(words) <= 5 and bool(_HEADER_RE.search(text)))


def candidate_lines(lines, shabad_info=None):
    vocab = heading_vocab(shabad_info) if shabad_info is not None else None
    cand = [i for i, l in enumerate(lines) if not is_header(l["text"], vocab)]
    return cand or list(range(len(lines)))


def line_tokens(lines):
    return [align.fold(l["text"]).split() for l in lines]


def idf_map(toks):
    n = len(toks)
    df = {}
    for t in toks:
        for w in set(t):
            df[w] = df.get(w, 0) + 1
    return {w: math.log(1.0 + n / c) for w, c in df.items()}


def idf_recall(win_toks, li_toks, idf):
    """IDF-weighted recall of the line's words in the window, fuzzy-matched.

    Recall rather than F1: a 15s window legitimately spans more than one line,
    so charging it for the extra words would penalise the correct line."""
    if not li_toks or not win_toks:
        return 0.0
    num = den = 0.0
    for w in set(li_toks):
        weight = idf.get(w, 1.0)
        den += weight
        best = 0
        for v in win_toks:
            if abs(len(v) - len(w)) > 3:
                continue
            r = fuzz.ratio(w, v)
            if r > best:
                best = r
                if best >= 95:
                    break
        if best >= 78:
            num += weight * (best / 100.0)
    return num / den if den else 0.0


def accumulate_frames(windows, rows, n_frames, n_lines):
    """Per-second evidence from per-window scores: average every window
    covering a frame. The one accumulation loop both decode paths share —
    a change here changes single-scale and two-scale identically, which is
    the point of it living here."""
    acc = [[0.0] * n_lines for _ in range(n_frames)]
    cnt = [0] * n_frames
    for w, row in zip(windows, rows):
        for t in range(int(w["start"]), min(int(w["end"]), n_frames)):
            cnt[t] += 1
            for j in range(n_lines):
                acc[t][j] += row[j]
    for t in range(n_frames):
        if cnt[t]:
            acc[t] = [v / cnt[t] for v in acc[t]]
    return acc, cnt


def score_matrix(windows, lines, blend):
    """[n_windows][n_lines] combined similarity."""
    lt = line_tokens(lines)
    idf = idf_map(lt)
    rows = []
    for w in windows:
        wt = align.fold(w["text"]).split()
        rows.append([(1 - blend) * align.score(w["text"], l["text"], True)
                     + blend * idf_recall(wt, lt[j], idf)
                     for j, l in enumerate(lines)])
    return rows


def align_case(case, asr, blend, floor, cand=None):
    """One case -> submission dict. `cand` is the candidate line set from
    candidate_lines(lines, shabad_info); passing it is not optional in spirit —
    deriving it here without shabad_info would silently fall back to the
    word-count heading heuristic that is documented above as wrong."""
    uem_s, uem_e = case["uem"]["start"], case["uem"]["end"]
    lines = case["lines"]
    ws = [w for w in asr["windows"] if w["start"] >= uem_s - 1e-6]
    rows = score_matrix(ws, lines, blend)

    n = int(uem_e) + 2
    acc, cnt = accumulate_frames(ws, rows, n, len(lines))

    if cand is None:
        cand = candidate_lines(lines)
    lab = []
    for t in range(n):
        if not cnt[t]:
            lab.append(-1)
            continue
        b = max(cand, key=lambda j: acc[t][j])
        lab.append(b if acc[t][b] >= floor else -1)
    for t in range(n):
        if t < uem_s or t > uem_e:
            lab[t] = -1
    return {"video_id": case["video_id"],
            "segments": align.labels_to_segments(lab)}
