"""The Guru Granth Sahib (and Bhai Gurdas Ji's Vaaran) on local disk, so the
scan shortlists shabads by scoring the audio against every line instead of
asking BaniDB's word search.

Why it exists: under the CTC model the scan's old shortlist — BaniDB full-word
search on the longest transcribed words — stopped containing the right shabad
on 4 of the 5 tagged ragi-wise recordings, because the longest words are
exactly the ones CTC misspells or runs together ("ਨਾਨਕਦਾਸ"). The scoring
itself was never the problem: against its own audio the right shabad scored
0.72-0.95, above the best wrong candidate. Scoring every window against every
line with that same folded partial ratio put every published shabad in the top
6. eval_scan.py is the measurement.

Fetched once from BaniDB's ang endpoint (1,470 pages, a few minutes), so the
ids are BaniDB's own and match renditions.shabad_id. Kept on local disk and in
the transcripts bucket, so a CI runner pays for the fetch once, not per run.
"""

import collections
import json
import os
import time

import numpy as np
from rapidfuzz import fuzz, process

import align
import runtime

# BaniDB source id -> pages its ang endpoint serves. Sri Guru Granth Sahib, and
# Bhai Gurdas Ji's Vaaran (one page per vaar), which ragis sing too: a
# published prod rendition of a vaar pauri was drafted as the nearest SGGS
# shabad before it was here. Dasam Bani is left out on purpose — rarely sung
# at Darbar Sahib, and ~1,400 more pages of lines to win votes they have not
# earned. Bhai Gurdas Ji's Kabit and Bhai Nand Lal have no pages to fetch.
SOURCES = {"G": 1430, "B": 40}
# Folded length a line needs to take part. Short lines ("ਰਹਾਉ", "ਮਹਲਾ ੫")
# partial-match inside almost any window and would win votes they have not
# earned; every shabad keeps plenty of longer lines to be found by.
MIN_CHARS = 15
# A window votes for the shabad of its best line only if that line scores
# this well (partial ratio, 0-100); below it the window is alaap or katha.
VOTE_FLOOR = 60
# In every cache key derived from a shortlist: a change to either knob is a
# different shortlist, not a cache hit.
TAG = f"{''.join(SOURCES)}{MIN_CHARS}v{VOTE_FLOOR}"

_index = None


def source_lines(source, cache_dir, store=True):
    """[[shabad_id, unicode line], ...] for one source, cached."""
    path = f"{cache_dir}/corpus_{source}.json"
    if os.path.exists(path):
        return json.load(open(path))
    key = f"corpus/{source}.json"
    data = runtime.fetch_transcript(key)
    if not data:
        print(f"  fetching corpus {source}: {SOURCES[source]} pages from "
              f"BaniDB…", flush=True)
        data = []
        for page in range(1, SOURCES[source] + 1):
            for v in runtime.banidb(f"/angs/{page}/{source}")["page"]:
                data.append([v["shabadId"], v["verse"]["unicode"]])
            time.sleep(0.1)
        if store:
            runtime.store_transcript(key, data)
    os.makedirs(cache_dir, exist_ok=True)
    json.dump(data, open(path, "w"), ensure_ascii=False)
    return data


def lines(cache_dir, store=True):
    return [row for s in SOURCES for row in source_lines(s, cache_dir, store)]


def _build(data):
    # Sorted by shabad so each shabad's lines are one contiguous block of
    # columns, which is what lets reduceat take the best line per shabad.
    rows = sorted((sid, align.fold(text)) for sid, text in data)
    rows = [(sid, f) for sid, f in rows if len(f) >= MIN_CHARS]
    sids = np.array([sid for sid, _ in rows])
    starts = np.flatnonzero(np.r_[True, sids[1:] != sids[:-1]])
    return [f for _, f in rows], starts, sids[starts]


def shortlist(windows, k, cache_dir, store=True):
    """The k shabads that win the most windows: [(shabad_id, votes)].

    Every window against every line, the same folded partial ratio
    align.score uses, so what gets shortlisted is what would score well
    anyway. ~1s for a 35-minute recording on a laptop: rapidfuzz runs the
    whole matrix across every core."""
    global _index
    if _index is None:
        _index = _build(lines(cache_dir, store))
    texts, starts, shabads = _index
    m = process.cdist([align.fold(w["text"]) for w in windows], texts,
                      scorer=fuzz.partial_ratio, workers=-1, dtype=np.uint8)
    best = np.maximum.reduceat(m, starts, axis=1)
    votes = collections.Counter()
    for row in best:
        if row.max() >= VOTE_FLOOR:
            votes[int(shabads[row.argmax()])] += 1
    return votes.most_common(k)
