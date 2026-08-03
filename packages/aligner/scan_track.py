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

Method: ASR the broadcast in 15s windows every 30s, search BaniDB with the
distinctive transcribed words, score every window against the top candidates
with the same folded matcher the aligner uses — so the confidence scale is the
calibrated one (correct tags historically 0.76–0.87, wrong ~0.51). Regions
where one shabad dominates become suggestions; a region must clear confidence
0.6 AND margin 0.05 over the runner-up to be drafted. Margin matters as much
as confidence: a 0.61/+0.01 region is a coin flip, not a tag.
"""

import collections
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

import soundfile as sf

import align
import matcher
import runtime
from runtime import MIN_CONFIDENCE, SB, SR, api, banidb

WIN, HOP = 15.0, 30.0
FLOOR = 0.55            # a window must match this well to vote for a region
MIN_MARGIN = 0.05       # the floor itself is runtime.MIN_CONFIDENCE
MAX_SEARCHES = 30
TOP_CANDIDATES = 8
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




def asr_scan(track_id, url):
    """Sparse sliding-window ASR over the whole file, cached per track."""
    os.makedirs(CACHE, exist_ok=True)
    wav = f"{CACHE}/track_{track_id}.wav"
    if not os.path.exists(wav):
        print("  fetching audio…", flush=True)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", url,
                        "-ar", str(SR), "-ac", "1", wav], check=True)
    cache = f"{CACHE}/track_{track_id}_scan.json"
    if os.path.exists(cache):
        return json.load(open(cache))["windows"]
    remote = runtime.fetch_transcript(f"scan/{track_id}_{WIN:g}s{HOP:g}s.json")
    if remote:
        json.dump(remote, open(cache, "w"), ensure_ascii=False)
        print("  scan windows: from storage", flush=True)
        return remote["windows"]
    pipe = runtime.load_pipe()
    audio, _ = sf.read(wav, dtype="float32")
    dur = len(audio) / SR
    starts = list(range(0, int(dur - WIN), int(HOP)))
    texts = []
    for i in range(0, len(starts), 8):
        clips = [audio[s * SR:int((s + WIN) * SR)] for s in starts[i:i + 8]]
        texts.extend(o["text"].strip() for o in
                     pipe(clips, generate_kwargs=runtime.GEN, batch_size=8))
        runtime.free_accelerator()
        print(f"  ASR {len(texts)}/{len(starts)}", end="\r", flush=True)
    print()
    windows = [{"start": float(s), "end": float(s + WIN), "text": tx}
               for s, tx in zip(starts, texts)]
    json.dump({"windows": windows}, open(cache, "w"), ensure_ascii=False)
    runtime.store_transcript(f"scan/{track_id}_{WIN:g}s{HOP:g}s.json",
                             {"windows": windows})
    return windows


def find_regions(windows):
    """Distinctive words -> BaniDB votes -> per-window scores -> regions."""
    freq = collections.Counter(w for x in windows for w in x["text"].split())
    terms, seen = [], set()
    for x in windows:
        words = [w for w in x["text"].split() if len(w) >= 4 and freq[w] <= 6]
        for w in sorted(words, key=len, reverse=True)[:2]:
            if w not in seen:
                seen.add(w)
                terms.append(w)
    votes = collections.Counter()
    for w in terms[:MAX_SEARCHES]:
        try:
            res = banidb(f"/search/{urllib.parse.quote(w)}?searchtype=2&results=20")
            for v in res.get("verses", []):
                votes[v["shabadId"]] += 1
        except Exception:
            pass
        time.sleep(0.25)
    cands = [sid for sid, _ in votes.most_common(TOP_CANDIDATES)]
    print(f"  candidates: {[(s, votes[s]) for s in cands]}")

    texts_of = {}
    for sid in cands:
        d = banidb(f"/shabads/{sid}")
        lines = [{"line_idx": i,
                  "text": v["verse"].get("unicode") or v["verse"]["gurmukhi"]}
                 for i, v in enumerate(d["verses"])]
        keep = matcher.candidate_lines(lines, d["shabadInfo"])
        texts_of[sid] = [lines[j]["text"] for j in keep]

    rows = [{sid: max(align.score(x["text"], t, True) for t in texts_of[sid])
             for sid in cands} for x in windows]
    labels = []
    for best in rows:
        sid = max(best, key=best.get) if best else None
        labels.append(sid if best and best[sid] >= FLOOR else None)

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
    for t0, t1, sid, conf, margin in regions:
        print(f"  {t0:6.0f}-{t1:6.0f}s  shabad {sid}  conf {conf:.2f}  "
              f"margin {margin:+.2f}")
    return regions


def write_drafts(track_id, windows, regions, owner=None):
    # Same shabad re-emerging after a short unlabeled stretch (vichar, alaap)
    # is one rendition, not two.
    merged = []
    for t0, t1, sid, conf, margin in regions:
        if merged and merged[-1][2] == sid and t0 - merged[-1][1] <= 150:
            m = merged[-1]
            merged[-1] = (m[0], t1, sid, max(m[3], conf), max(m[4], margin))
        else:
            merged.append((t0, t1, sid, conf, margin))

    existing = {r["shabad_id"] for r in
                api(f"{SB}/renditions?track_id=eq.{track_id}&select=shabad_id")}
    drafted = 0
    findings = []
    for t0, t1, sid, conf, margin in merged:
        if conf < MIN_CONFIDENCE or margin < MIN_MARGIN:
            print(f"  not drafting shabad {sid} ({t0:.0f}-{t1:.0f}s): "
                  f"conf {conf:.2f} margin {margin:+.2f} below gate")
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
