"""Measure the scan against what people published.

Ground truth is every published rendition: its shabad and its boundaries. For
each track with one, the scan runs exactly as scan_track.py runs it — dense
transcript, shortlist, per-second evidence, regions, edges, align — and the
result is judged against the tags:

  found      a published rendition some draft names, over enough of it
  wrong      a draft whose best-overlapping published rendition is another shabad
  unjudged   a draft on time nobody has tagged (says nothing either way)
  edges      how far a found rendition's draft edges sit from the human's,
             and how much tagged time the draft cuts off

Read-only by construction, so it is safe to point at prod: GETs only,
transcripts and corpus kept on disk (store=False), nothing drafted.

Two halves, so the ASR can fan out across runners and one step reads it all:

    # everything on one machine
    SB_URL=... SB_KEY=... uv run python eval_scan.py
    # one of N shards (scan.yml's eval job runs these as a matrix)
    uv run python eval_scan.py --shard 3/8 --out results
    # the report, over every shard's output
    uv run python eval_scan.py --report results

A run keeps each track's per-second evidence, so the report re-derives
regions for every FLOOR x MIN_MARGIN pair without any ASR or BaniDB.
"""

import argparse
import collections
import glob
import json
import os
import statistics
import time

import numpy as np

import scan_track
from runtime import MIN_CONFIDENCE, SB, api

FLOORS = (0.55, 0.60, 0.65)
MARGINS = (0.03, 0.05, 0.08, 0.10)
PAGE = 1000            # PostgREST's default max-rows; paging past it is not optional

ap = argparse.ArgumentParser()
ap.add_argument("--limit", type=int, default=None,
                help="evaluate at most N tracks, fully tagged ones first")
ap.add_argument("--exclude-shabad", type=int, action="append", default=[],
                help="drop published renditions of this shabad from the truth "
                     "(a known mistag); a region there is then unjudged")
ap.add_argument("--truth", help="ground truth from a JSON export instead of "
                "the database: [{track_id, url, done, spans: [{shabad_id, start, "
                "end}]}] — the query is in README.md")
ap.add_argument("--shard", default="0/1",
                help="I/N: evaluate every Nth track starting at I")
ap.add_argument("--out", default=f"{scan_track.CACHE}/eval",
                help="where each track's result is written")
ap.add_argument("--report", metavar="DIR",
                help="skip the run; report over the results in DIR")
args = ap.parse_args()


def paged(url):
    out, offset = [], 0
    while True:
        rows = api(f"{url}&limit={PAGE}&offset={offset}")
        out += rows
        if len(rows) < PAGE:
            return out
        offset += PAGE


def truth():
    """{track_id: {url, done, spans: [(start, end, shabad_id)]}}"""
    if args.truth:
        # An export someone ran in the SQL editor: no database connection at all.
        return {t["track_id"]: {
                    "url": t["url"], "done": t["done"],
                    "spans": sorted((float(s["start"]), float(s["end"]),
                                     s["shabad_id"]) for s in t["spans"]
                                    if s["shabad_id"] not in args.exclude_shabad)}
                for t in json.load(open(args.truth))}
    spans = collections.defaultdict(list)
    for r in paged(f"{SB}/renditions?status=eq.published&shabad_id=not.is.null"
                   f"&select=track_id,shabad_id,start_sec,end_sec&order=id"):
        if r["shabad_id"] in args.exclude_shabad:
            continue
        spans[r["track_id"]].append(
            (float(r["start_sec"]), float(r["end_sec"]), r["shabad_id"]))
    ids, out = list(spans), {}
    # Chunked: a few hundred ids is as long as a query string should get.
    for i in range(0, len(ids), 100):
        chunk = ",".join(ids[i:i + 100])
        for t in api(f"{SB}/tracks?id=in.({chunk})"
                     f"&select=id,url,missing_since,tagged_done_at"):
            if t["missing_since"] is None:
                out[t["id"]] = {"url": t["url"],
                                "done": t["tagged_done_at"] is not None,
                                "spans": sorted(spans[t["id"]])}
    return out


def run():
    tracks = truth()
    order = sorted(tracks, key=lambda k: (not tracks[k]["done"],
                                          -len(tracks[k]["spans"]), k))
    if args.limit:
        order = order[:args.limit]
    i, n = (int(x) for x in args.shard.split("/"))
    order = order[i::n]
    os.makedirs(args.out, exist_ok=True)
    print(f"shard {args.shard}: {len(order)} track(s)\n")
    for k in order:
        tr = tracks[k]
        print(f"── {k}  ({len(tr['spans'])} published"
              f"{', fully tagged' if tr['done'] else ''})", flush=True)
        t = {}
        long_w, short_w = scan_track.transcribe(k, tr["url"], store=False,
                                                timings=t)
        if not long_w:
            continue
        s0 = time.monotonic()
        shabads = scan_track.shortlist(long_w, store=False)
        n_sec = int(max(w["end"] for w in long_w)) + 1
        sids, ev = scan_track.evidence(long_w, short_w, shabads, n_sec)
        found = scan_track.find_drafts(sids, ev, long_w, short_w, shabads)
        t["match"] = time.monotonic() - s0
        if "asr" in t:
            print(f"  {t['duration'] / 60:.1f} min: fetch {t['fetch']:.0f}s, "
                  f"ASR {t['asr']:.0f}s (RTF {t['asr'] / t['duration']:.3f}), "
                  f"match {t['match']:.0f}s", flush=True)
        json.dump({"track_id": k, "url": tr["url"], "done": tr["done"],
                   "spans": tr["spans"], "sids": sids,
                   "ev": np.round(ev, 4).tolist(), "timing": t,
                   "drafts": [list(g) + [a] for g, a, _ in found
                              if a is not None]},
                  open(f"{args.out}/{k}.json", "w"))


def overlap(a0, a1, b0, b1):
    return max(0.0, min(a1, b1) - max(a0, b0))


def enough(g, s):
    return overlap(g[0], g[1], s[0], s[1]) >= 0.5 * min(g[1] - g[0], s[1] - s[0])


def judge(drafts, spans):
    """(correct, wrong, unjudged, found spans, edge errors, cut off, extra)"""
    ok = wrong = unj = 0
    for g in drafts:
        best = max(spans, key=lambda s: overlap(g[0], g[1], s[0], s[1]),
                   default=None)
        if best and enough(g, best):
            ok += best[2] == g[2]
            wrong += best[2] != g[2]
        else:
            unj += 1
    hit, errs, lost, extra = 0, [], 0.0, 0.0
    for s in spans:
        m = [g for g in drafts if g[2] == s[2] and enough(g, s)]
        if m:
            hit += 1
            g0, g1 = min(g[0] for g in m), max(g[1] for g in m)
            errs += [abs(g0 - s[0]), abs(g1 - s[1])]
            lost += max(0, g0 - s[0]) + max(0, s[1] - g1)
            extra += max(0, s[0] - g0) + max(0, g1 - s[1])
    return ok, wrong, unj, hit, errs, lost, extra


def report(folder):
    cases = [json.load(open(p)) for p in sorted(glob.glob(f"{folder}/*.json"))]
    for c in cases:
        c["spans"] = [tuple(s) for s in c["spans"]]
        c["ev"] = np.array(c["ev"])
    total = sum(len(c["spans"]) for c in cases)
    print(f"\n{total} published rendition(s) on {len(cases)} track(s), "
          f"{sum(c['done'] for c in cases)} fully tagged\n")

    print(f"{'floor':>5} {'margin':>6} | {'drafts':>6} {'ok':>3} {'wrong':>5} "
          f"{'unjdg':>5} | {'prec':>5} {'found':>5} | {'edge med':>8} "
          f"{'MAE':>6} {'cut off':>8}")
    saved = (scan_track.FLOOR, scan_track.MIN_MARGIN)
    for floor in FLOORS:
        for margin in MARGINS:
            scan_track.MIN_MARGIN = margin
            tot = collections.Counter()
            errs = []
            for c in cases:
                regions = scan_track.merge_regions(
                    scan_track.regions_from(c["sids"], c["ev"], floor))
                drafts = scan_track.refine_edges(
                    [g for g in regions if scan_track.is_draft(g)],
                    c["sids"], c["ev"])
                ok, wrong, unj, hit, e, lost, extra = judge(drafts, c["spans"])
                tot.update(ok=ok, wrong=wrong, unj=unj, hit=hit)
                tot["lost"] += lost
                errs += e
            now = (floor, margin) == saved
            print(f"{floor:5.2f} {margin:6.2f} | "
                  f"{tot['ok'] + tot['wrong'] + tot['unj']:6d} {tot['ok']:3d} "
                  f"{tot['wrong']:5d} {tot['unj']:5d} | "
                  f"{tot['ok'] / max(1, tot['ok'] + tot['wrong']):5.2f} "
                  f"{tot['hit'] / total:5.2f} | "
                  f"{statistics.median(errs) if errs else 0:7.1f}s "
                  f"{statistics.mean(errs) if errs else 0:5.1f}s "
                  f"{tot['lost']:7.0f}s{'  <- current' if now else ''}")
    scan_track.FLOOR, scan_track.MIN_MARGIN = saved

    # Auto-publish bands, over the drafts the shipped settings wrote (they
    # carry align's confidence, which only a full run computes).
    print("\nauto-publish bands (shipped settings; judged drafts only):")
    rows = []
    for c in cases:
        for d in c["drafts"]:
            best = max(c["spans"], key=lambda s: overlap(d[0], d[1], s[0], s[1]),
                       default=None)
            j = (best[2] == d[2]) if best and enough(d, best) else None
            rows.append((d, j))
    for conf, margin, length, al in ((0.0, 0.0, 0, 0.0), (0.70, 0.10, 120, 0.75),
                                     (0.72, 0.12, 180, 0.78),
                                     (0.75, 0.10, 120, 0.80),
                                     (0.75, 0.15, 240, 0.80)):
        sub = [(d, j) for d, j in rows if d[3] >= conf and d[4] >= margin
               and d[1] - d[0] >= length and d[5] >= al]
        judged = [j for _, j in sub if j is not None]
        print(f"  conf>={conf:.2f} margin>={margin:.2f} len>={length:3d}s "
              f"align>={al:.2f}: {len(sub):3d} drafts, {len(judged):2d} judged, "
              f"{judged.count(False)} wrong")

    for kind in ("ragiwise", "puratan"):
        sub = [c for c in cases if f"/{kind}" in c["url"]
               or (kind == "puratan" and "puratanlkirtan" in c["url"])]
        n = sum(len(c["spans"]) for c in sub)
        if not n:
            continue
        hit = sum(judge([d[:5] for d in c["drafts"]], c["spans"])[3] for c in sub)
        print(f"\n{kind}: {hit}/{n} found at shipped settings")

    asr = [c["timing"] for c in cases if c["timing"].get("asr")]
    if asr:
        rtf = [t["asr"] / t["duration"] for t in asr]
        print(f"\nASR RTF over {len(asr)} fresh transcript(s): median "
              f"{statistics.median(rtf):.3f}, max {max(rtf):.3f}; "
              f"{sum(t['duration'] for t in asr) / 3600:.1f} h of audio")
    print(f"(MIN_CONFIDENCE {MIN_CONFIDENCE}, MIN_DRAFT_SEC "
          f"{scan_track.MIN_DRAFT_SEC})")


if __name__ == "__main__":
    if args.report:
        report(args.report)
    else:
        run()
        if args.shard == "0/1":
            report(args.out)
