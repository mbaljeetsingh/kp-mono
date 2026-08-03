"""Phonetic folding and fuzzy scoring for Gurmukhi — the primitives everything
in this package matches with.

Trimmed to what production uses. The benchmark harness, ablations and the
decoders that measured *worse* than plain argmax (HMM, triangular weighting,
centre-cropping) live in the research repo, not here — see
docs/line-alignment-prototype.md for why each one lost.
"""

import functools
import re
import unicodedata

from rapidfuzz import fuzz

NUKTA = "਼"
# Vowel signs, nasalisation, gemination, halant — the first things ASR drops or
# invents on sung input, and the least informative for telling lines apart.
DIACRITICS = "ਾਿੀੁੂੇੈੋੌੰਂੱ੍ਃ"
# Retroflex/dental pairs that kirtan ASR routinely confuses.
CONSONANTS = str.maketrans({"ਣ": "ਨ", "ਟ": "ਤ", "ਠ": "ਥ", "ਡ": "ਦ", "ਢ": "ਧ"})
PUNCT = re.compile(r"[॥।\d੦-੯\.,!?\-–—:;\"'()]+")


# Memoized: pure function of its arguments, and the matching loops call it
# with the same handful of canonical line strings tens of thousands of times
# per run (every window x every candidate x every line). Two orders of
# magnitude of redundant NFD/translate work for free without it.
@functools.lru_cache(maxsize=65536)
def fold(s, phonetic=True):
    s = PUNCT.sub(" ", s)
    if phonetic:
        # ੜ decomposes to ਡ+nukta under NFD, which would send it down the
        # retroflex path; it is its own letter, so fold it to ਰ first.
        s = s.replace("ੜ", "ਰ")
        # Nukta letters are inconsistently encoded — ਸ਼ is base+nukta, ਖ਼ is
        # precomposed. NFD makes both decomposed so one strip covers all.
        s = unicodedata.normalize("NFD", s).replace(NUKTA, "")
        s = s.translate(CONSONANTS)
        s = "".join(c for c in s if c not in DIACRITICS)
    return " ".join(s.split())


def score(win_text, line_text, phonetic):
    a, b = fold(win_text, phonetic), fold(line_text, phonetic)
    if not a or not b:
        return 0.0
    # partial_ratio finds the best-matching substring, so a window holding the
    # line three times (the ragi repeating it) is not penalised.
    return fuzz.partial_ratio(a, b) / 100.0


def labels_to_segments(labels):
    """Collapse per-second labels into [{start, end, line_idx}] runs."""
    segs, i = [], 0
    while i < len(labels):
        if labels[i] is None or labels[i] < 0:
            i += 1
            continue
        j = i
        while j + 1 < len(labels) and labels[j + 1] == labels[i]:
            j += 1
        segs.append({"start": float(i), "end": float(j + 1),
                     "line_idx": int(labels[i])})
        i = j + 1
    return segs
