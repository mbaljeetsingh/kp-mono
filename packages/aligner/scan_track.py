"""Blind scan: suggest which shabads a recording contains, and roughly when.

The identification half of the pipeline — write_timings.py is the timing half.
No shabad_id is given and nothing is published: confident regions become
renditions with status 'shabad_linked' and source 'scan', which the shabads
view never serves. A human reviews the boundaries in the tagger and publishes;
that is the only human step in the whole pipeline, and alignment deliberately
waits for it — lyrics are computed for verified tags, not guesses.

Two ways to run it:

    SB_KEY=... TRACK=<id> python scan_track.py [--write-drafts]
    SB_KEY=... python scan_track.py --from-queue [--limit N]

Queue mode consumes scan_requests (the admin button writes rows there), oldest
first, and stamps done_at whether or not anything was confident enough to
draft — "scanned, nothing found" must not look like "still waiting".

Method: ASR the broadcast in 15s windows every 30s, shortlist the shabads whose
lines win the most windows across the whole Guru Granth Sahib (corpus.py),
score every window against the shortlist with the same folded matcher the
aligner uses — so the confidence scale is the calibrated one (correct tags
0.82–0.92, wrong ~0.52). The shortlist used to come from BaniDB word search,
which stopped finding the right shabad under the CTC model; FLOOR and
MIN_MARGIN are re-measured by eval_scan.py. Regions
where one shabad dominates become suggestions; a region must clear confidence
0.6 AND margin 0.05 over the runner-up to be drafted. Margin matters as much
as confidence: a 0.61/+0.01 region is a coin flip, not a tag.
"""

import json
import os
import re
import subprocess
import sys
import time

import soundfile as sf

import align
import corpus
import matcher
import runtime
from runtime import MIN_CONFIDENCE, SB, SR, api, banidb

WIN, HOP = 15.0, 30.0
FLOOR = 0.55            # a window must match this well to vote for a region
MIN_MARGIN = 0.05       # the floor itself is runtime.MIN_CONFIDENCE
MIN_DRAFT_SEC = 60      # shorter regions are pointers (see is_draft)
QUOTE_MAX_SEC = 90      # a run this short inside another shabad is a quote
SMOOTH = 3              # windows averaged per label (see regions_from)
MERGE_ACROSS_SEC = 300  # one shabad either side of only pointers is one draft
# Each shortlisted shabad costs one BaniDB fetch; 8 crowded a real shabad off
# the list on a prod recording whose shortlist was full of routine banis.
TOP_CANDIDATES = 16
CACHE = "cache"


def pretty_name(transliteration):
    """prettyShabadName from apps/admin/app/composables/useShabadName.ts, in
    Python — the same normalisation the tagger sees when admin auto-fills a
    name, so scan drafts read like hand-made ones. Keep the rule lists in sync.
    """
    out = transliteration
    for pat, rep in [
        (r"\|\||॥|।", ""), (r"\d+", ""), (r"\(nn?\)", "n"),
        (r"aa", "a"), (r"oo", "u"), (r"ee", "i"),
        (r"dh\b", "d"), (r"\bth\b", "t"), (r"\s+", " "),
    ]:
        out = re.sub(pat, rep, out, flags=re.IGNORECASE)
    # Title case; the rest of each word lowered, because BaniDB capitalises
    # mid-word to mark retroflex letters — meaningful there, noise in a title.
    return re.sub(r"[A-Za-z][A-Za-z']*",
                  lambda m: m[0][0].upper() + m[0][1:].lower(), out).strip()




def asr_scan(track_id, url, store=True, timings=None):
    """Sparse sliding-window ASR over the whole file, cached per track.

    `store=False` keeps a transcript on local disk only (eval_scan.py runs
    against prod and must not write to it). `timings`, when given, receives
    fetch/asr seconds and the audio's duration for whatever this call did."""
    os.makedirs(CACHE, exist_ok=True)
    # The model is in both keys: another model's text is a different scale,
    # not a cache hit.
    key = f"{track_id}_{WIN:g}s{HOP:g}s_{runtime.WINDOWED_TAG}"
    cache = f"{CACHE}/track_{key}_scan.json"
    if os.path.exists(cache):
        return json.load(open(cache))["windows"]
    remote = runtime.fetch_transcript(f"scan/{key}.json")
    if remote:
        json.dump(remote, open(cache, "w"), ensure_ascii=False)
        print("  scan windows: from storage", flush=True)
        return remote["windows"]
    # Fetched only past both caches. Re-matching an already-scanned archive
    # (a new floor, a better matcher) must not re-download every recording.
    wav = f"{CACHE}/track_{track_id}.wav"
    t = time.monotonic()
    if not os.path.exists(wav):
        print("  fetching audio…", flush=True)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", url,
                        "-ar", str(SR), "-ac", "1", wav], check=True)
    audio, _ = sf.read(wav, dtype="float32")
    dur = len(audio) / SR
    fetched = time.monotonic()
    # Window by window, not sliced: the grid covers half the broadcast, so
    # running only the windows is half the audio through the model.
    starts = [float(s) for s in range(0, int(dur - WIN), int(HOP))]
    windows = runtime.transcribe_windows(audio, WIN, HOP, starts=starts,
                                         label="scan windows")
    if timings is not None:
        timings.update(fetch=fetched - t, asr=time.monotonic() - fetched,
                       duration=dur)
    json.dump({"windows": windows}, open(cache, "w"), ensure_ascii=False)
    if store:
        runtime.store_transcript(f"scan/{key}.json", {"windows": windows})
    return windows


def find_regions(windows, store=True):
    """Shortlist -> per-window scores -> regions."""
    regions = regions_from(windows, score_windows(windows, store))
    for t0, t1, sid, conf, margin in regions:
        print(f"  {t0:6.0f}-{t1:6.0f}s  shabad {sid}  conf {conf:.2f}  "
              f"margin {margin:+.2f}")
    return regions


def score_windows(windows, store=True):
    """Every window's best match against each shortlisted shabad:
    [{shabad_id: score}] in window order. Split from find_regions so
    eval_scan.py can sweep FLOOR over it without re-scoring."""
    # The shortlist is local (corpus.py), not BaniDB word search: the old
    # search missed the right shabad on most CTC transcripts.
    shortlist = corpus.shortlist(windows, TOP_CANDIDATES, CACHE, store)
    cands = [sid for sid, _ in shortlist]
    print(f"  candidates: {shortlist}")

    texts_of = {}
    for sid in cands:
        d = banidb(f"/shabads/{sid}")
        lines = [{"line_idx": i,
                  "text": v["verse"].get("unicode") or v["verse"]["gurmukhi"]}
                 for i, v in enumerate(d["verses"])]
        keep = matcher.candidate_lines(lines, d["shabadInfo"])
        texts_of[sid] = [lines[j]["text"] for j in keep]

    return [{sid: max(align.score(x["text"], t, True) for t in texts_of[sid])
             for sid in cands} for x in windows]


def regions_from(windows, rows, floor=FLOOR):
    """Runs of windows one shabad wins at `floor` or better -> regions of
    (start, end, shabad_id, mean confidence, mean margin over runner-up).

    Each window's scores are averaged with its neighbours' first. With 16
    candidates a near-identical shabad wins the odd single window, which cut
    real renditions into pieces under MIN_DRAFT_SEC; on the 48 prod
    renditions smoothing took recall from 0.81 to 0.90 at the same margin."""
    h = SMOOTH // 2
    rows = [{s: sum(r.get(s, 0) for r in rows[max(0, i - h):i + h + 1])
             / len(rows[max(0, i - h):i + h + 1]) for s in rows[i]}
            for i in range(len(rows))]
    labels = []
    for best in rows:
        sid = max(best, key=best.get) if best else None
        labels.append(sid if best and best[sid] >= floor else None)

    regions, i = [], 0
    while i < len(labels):
        if labels[i] is None:
            i += 1
            continue
        j = i
        while j + 1 < len(labels) and labels[j + 1] == labels[i]:
            j += 1
        if j - i >= 1:                   # ≥2 windows ≈ 45s of evidence
            sid = labels[i]
            span = [r[sid] for r in rows[i:j + 1]]
            others = [max((v for k, v in r.items() if k != sid), default=0)
                      for r in rows[i:j + 1]]
            regions.append((windows[i]["start"], windows[j]["end"], sid,
                            sum(span) / len(span),
                            sum(span) / len(span) - sum(others) / len(others)))
        i = j + 1
    return regions


def drop_quotes(regions):
    """A short run of one shabad between two runs of another is a quote.

    Ragis quote pangtis from other shabads during vichar (pramaan), and a
    quoted line scores as well as a sung one — 0.98 on one prod recording. On
    the 48 published prod renditions, most wrong drafts were exactly this: 45-
    75 s of some other shabad inside a correctly tagged one. It is Gurbani, but
    not a rendition, so it is neither drafted nor pointed at."""
    out = []
    for i, g in enumerate(regions):
        if g[1] - g[0] <= QUOTE_MAX_SEC:
            before = [h for h in regions[:i]
                      if g[0] - h[1] <= 150 and h[2] != g[2]]
            after = [h for h in regions[i + 1:]
                     if h[0] - g[1] <= 150 and h[2] != g[2]]
            if before and after and before[-1][2] == after[0][2]:
                continue
        out.append(g)
    return out


def is_draft(region):
    """The gate. Length as well as confidence and margin: a 45 s region is two
    windows of evidence. On the 48 published prod renditions, requiring 60 s
    cut wrong drafts from 13 to 4 and cost no recall. Anything shorter or
    weaker is a pointer."""
    t0, t1, _, conf, margin = region
    return (conf >= MIN_CONFIDENCE and margin >= MIN_MARGIN
            and t1 - t0 >= MIN_DRAFT_SEC)


def merge_regions(regions):
    """Same shabad re-emerging after a short unlabeled stretch (vichar, alaap)
    is one rendition, not two. Quotes are dropped first, so a quote in the
    middle of a shabad does not split it."""
    regions = drop_quotes(regions)
    merged = []
    for t0, t1, sid, conf, margin in regions:
        if merged and merged[-1][2] == sid and t0 - merged[-1][1] <= 150:
            m = merged[-1]
            merged[-1] = (m[0], t1, sid, max(m[3], conf), max(m[4], margin))
        else:
            merged.append((t0, t1, sid, conf, margin))
    # Second pass: the same shabad either side of nothing but pointers. Vichar
    # and alaap mid-shabad throw up weak one-window runs of other shabads, and
    # those broke 3950 (tagged 525-1105 s) into two drafts of one shabad.
    out = []
    for g in merged:
        # The last draft so far, if only pointers have come since.
        k = next((i for i in range(len(out) - 1, -1, -1)
                  if is_draft(out[i])), None)
        if (is_draft(g) and k is not None and out[k][2] == g[2]
                and g[0] - out[k][1] <= MERGE_ACROSS_SEC):
            m = out[k]
            out[k:] = [(m[0], g[1], g[2], max(m[3], g[3]), max(m[4], g[4]))]
        else:
            out.append(g)
    return out


def write_drafts(track_id, windows, regions, owner=None):
    merged = merge_regions(regions)

    existing = {r["shabad_id"] for r in
                api(f"{SB}/renditions?track_id=eq.{track_id}&select=shabad_id")}
    drafted = 0
    findings = []
    for t0, t1, sid, conf, margin in merged:
        if not is_draft((t0, t1, sid, conf, margin)):
            print(f"  not drafting shabad {sid} ({t0:.0f}-{t1:.0f}s): "
                  f"conf {conf:.2f} margin {margin:+.2f}, {t1 - t0:.0f}s "
                  f"below gate")
            # Refusing to draft must not mean refusing to tell: this becomes a
            # listen-here pointer in the tagger (scan_requests.findings).
            try:
                d = banidb(f"/shabads/{sid}")
                full = [{"line_idx": k, "text":
                         w["verse"].get("unicode") or w["verse"]["gurmukhi"]}
                        for k, w in enumerate(d["verses"])]
                first = matcher.candidate_lines(full, d["shabadInfo"])[0]
                tr = d["verses"][first].get("transliteration") or ""
                if isinstance(tr, dict):
                    tr = tr.get("english") or next(iter(tr.values()), "")
                name = pretty_name(tr) or f"Shabad {sid}"
            except Exception:
                name = f"Shabad {sid}"
            findings.append({"shabad_id": sid, "name": name[:80],
                             "start": round(t0, 1), "end": round(t1, 1),
                             "confidence": round(conf, 2),
                             "margin": round(margin, 2)})
            continue
        if sid in existing:
            print(f"  shabad {sid} already has a rendition here, skipping")
            continue
        d = banidb(f"/shabads/{sid}")
        full = [{"line_idx": k,
                 "text": w["verse"].get("unicode") or w["verse"]["gurmukhi"]}
                for k, w in enumerate(d["verses"])]
        keep = matcher.candidate_lines(full, d["shabadInfo"])
        # Anchor = the line the region's audio dwells on. The dominant line
        # agreed with the tagger's hand-picked main_verse_id on every
        # correctly-tagged rendition, so it is what a listener knows this
        # rendition by — which is exactly what the name is for.
        reg = [x for x in windows if x["start"] >= t0 and x["end"] <= t1]
        dom = max(keep, key=lambda j: sum(
            align.score(x["text"], full[j]["text"], True) for x in reg))
        verse = d["verses"][dom]
        tr = verse.get("transliteration") or ""
        if isinstance(tr, dict):
            tr = tr.get("english") or next(iter(tr.values()), "")
        name = pretty_name(tr) or f"Shabad {sid}"
        row = api(f"{SB}/renditions", method="POST", body={
            "track_id": track_id,
            "start_sec": round(t0, 2), "end_sec": round(t1, 2),
            "name": name[:80], "shabad_id": sid,
            "main_verse_id": verse["verseId"],
            "status": "shabad_linked", "source": "scan",
            # The draft belongs to whoever requested the scan. Without this
            # the renditions SELECT policy (published OR own OR reviewer)
            # hides scan drafts from the very tagger who asked for them.
            "created_by": owner,
        }, extra={"Prefer": "return=representation"})
        drafted += 1
        print(f'  DRAFT {row[0]["id"][:8]}  {t0:6.0f}-{t1:6.0f}s  '
              f'shabad {sid}  conf {conf:.2f}  "{name[:44]}"')
    return drafted, findings


def scan(track_id, drafts, owner=None):
    rows = api(f"{SB}/tracks?id=eq.{track_id}"
               f"&select=url,artist_dir,date,missing_since")
    if not rows or rows[0]["missing_since"] is not None:
        print(f"── {track_id}: gone from sgpc.net, nothing to scan")
        return 0, []
    track = rows[0]
    print(f"── {track['artist_dir']}  {track['date']}  ({track_id})")
    windows = asr_scan(track_id, track["url"])
    regions = find_regions(windows)
    if not drafts:
        return 0, []
    return write_drafts(track_id, windows, regions, owner)


if __name__ == "__main__":
    if "--from-queue" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1]) \
            if "--limit" in sys.argv else 3
        queue = api(f"{SB}/scan_requests?done_at=is.null"
                    f"&order=requested_at.asc&limit={limit}"
                    f"&select=track_id,requested_by")
        print(f"scan queue: {len(queue)} request(s), limit {limit}\n")
        for q in queue:
            # One broken track (dead URL tonight, BaniDB hiccup) must not
            # wedge the whole queue: the oldest request would otherwise be
            # retried first every night, and everything behind it starves.
            # No done_at on failure — a transient error deserves a retry.
            try:
                n, found = scan(q["track_id"], drafts=True,
                                owner=q["requested_by"])
            except Exception as e:
                print(f"  FAILED, leaving queued for retry: {e}\n")
                continue
            # Done even when nothing was drafted — "scanned, nothing found"
            # must not look like "still waiting" or it re-queues forever.
            # Findings replace wholesale: they describe THIS scan.
            api(f"{SB}/scan_requests?track_id=eq.{q['track_id']}",
                method="PATCH",
                body={"done_at": "now()", "findings": found or None})
            print(f"  marked done ({n} draft(s), "
                  f"{len(found)} listen-here pointer(s))\n")
    else:
        scan(os.environ["TRACK"], drafts="--write-drafts" in sys.argv)
