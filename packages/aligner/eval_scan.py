"""Re-measure the scan's gates under the current ASR model.

scan_track.py's FLOOR and MIN_MARGIN were set under surt-small-v3 and never
re-measured in the switch to the CTC model, while write_timings' floor had to
move (0.40 -> 0.35) because CTC text scores every line a little lower. A scan
floor that is too high fails quietly: real regions never form, and the scan
answers "nothing found" about a recording full of shabads.

Ground truth is what humans published. For every track with a published
rendition, the scan runs exactly as the scanner runs it — same windows, same
BaniDB search, same scoring — once, and every FLOOR x MIN_MARGIN pair is then
replayed over those scores. The scores are cached per track, so re-running
with a different grid costs no BaniDB calls and no ASR.

Read-only by construction, so it is safe to point at prod: GETs only,
transcripts kept on local disk (asr_scan store=False), nothing drafted.

    SB_URL=https://<ref>.supabase.co/rest/v1 SB_KEY=<key> \\
      uv run python eval_scan.py [--limit N] [--exclude-shabad ID ...]

A would-be draft is judged by the published rendition it overlaps most, if
that overlap covers at least half of the shorter span: CORRECT when the shabad
matches, WRONG when it does not. One that overlaps nothing published is EXTRA
on a track marked fully tagged (the tagger said the rest is not shabads) and
UNJUDGED elsewhere (untagged audio says nothing either way).
"""

import argparse
import collections
import json
import os
import statistics
import time

import corpus
import runtime
import scan_track
from runtime import MIN_CONFIDENCE, SB, api

FLOORS = (0.40, 0.45, 0.50, 0.55, 0.60)
MARGINS = (0.02, 0.03, 0.05, 0.08, 0.10)
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
                    "spans": sorted((float(s["start"]), float(s["end"]), s["shabad_id"])
                                    for s in t["spans"]
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


def scores(track_id, windows):
    """score_windows, cached per model AND shortlist: a new shortlist is a
    different candidate set, not a hit. store=False: the corpus stays local."""
    path = (f"{scan_track.CACHE}/eval_{track_id}_{runtime.WINDOWED_TAG}_"
            f"{corpus.TAG}_rows.json")
    if os.path.exists(path):
        return [{int(k): v for k, v in row.items()}
                for row in json.load(open(path))], None
    t = time.monotonic()
    rows = scan_track.score_windows(windows, store=False)
    json.dump(rows, open(path, "w"))
    return rows, time.monotonic() - t


def overlap(a0, a1, b0, b1):
    return max(0.0, min(a1, b1) - max(a0, b0))


def judge(region, spans, done):
    t0, t1, sid = region[:3]
    best, most = None, 0.0
    for s0, s1, ssid in spans:
        o = overlap(t0, t1, s0, s1)
        if o >= 0.5 * min(t1 - t0, s1 - s0) and o > most:
            best, most = ssid, o
    if best is None:
        return "extra" if done else "unjudged"
    return "correct" if best == sid else "wrong"


def found(span, regions):
    """Did any region name this rendition's shabad over enough of it?"""
    s0, s1, sid = span
    return any(r[2] == sid and
               overlap(r[0], r[1], s0, s1) >= 0.5 * min(r[1] - r[0], s1 - s0)
               for r in regions)


def main():
    tracks = truth()
    order = sorted(tracks, key=lambda k: (not tracks[k]["done"],
                                          -len(tracks[k]["spans"]), k))
    if args.limit:
        order = order[:args.limit]
    n_spans = sum(len(tracks[k]["spans"]) for k in order)
    print(f"ground truth: {n_spans} published rendition(s) on {len(order)} "
          f"track(s), {sum(tracks[k]['done'] for k in order)} fully tagged\n")

    cases, timing = [], []
    for k in order:
        tr = tracks[k]
        print(f"── {k}  ({len(tr['spans'])} published"
              f"{', fully tagged' if tr['done'] else ''})")
        t = {}
        windows = scan_track.asr_scan(k, tr["url"], store=False, timings=t)
        rows, search_s = scores(k, windows)
        if t:
            t["search"] = search_s
            timing.append(t)
            print(f"  {t['duration'] / 60:.1f} min of audio: fetch "
                  f"{t['fetch']:.0f}s, ASR {t['asr']:.0f}s "
                  f"(RTF {t['asr'] / t['duration']:.3f})"
                  + (f", shortlist + scoring {search_s:.0f}s"
                     if search_s is not None else ""))
        cases.append((windows, rows, tr))

    print(f"\n{'floor':>5} {'margin':>6} | {'drafts':>6} {'ok':>3} {'wrong':>5} "
          f"{'extra':>5} {'unjdg':>5} | {'prec':>5} {'recall':>6} "
          f"{'+pointers':>9}")
    for floor in FLOORS:
        for margin in MARGINS:
            tally = collections.Counter()
            hit = hit_any = 0
            for windows, rows, tr in cases:
                regions = scan_track.merge_regions(
                    scan_track.regions_from(windows, rows, floor))
                # scan_track.is_draft with the margin swept.
                drafts = [r for r in regions
                          if r[3] >= MIN_CONFIDENCE and r[4] >= margin
                          and r[1] - r[0] >= scan_track.MIN_DRAFT_SEC]
                for r in drafts:
                    tally[judge(r, tr["spans"], tr["done"])] += 1
                hit += sum(found(s, drafts) for s in tr["spans"])
                hit_any += sum(found(s, regions) for s in tr["spans"])
            judged = tally["correct"] + tally["wrong"] + tally["extra"]
            prec = tally["correct"] / judged if judged else float("nan")
            now = (floor == scan_track.FLOOR and
                   margin == scan_track.MIN_MARGIN)
            print(f"{floor:5.2f} {margin:6.2f} | {sum(tally.values()):6d} "
                  f"{tally['correct']:3d} {tally['wrong']:5d} "
                  f"{tally['extra']:5d} {tally['unjudged']:5d} | "
                  f"{prec:5.2f} {hit / n_spans:6.2f} {hit_any / n_spans:9.2f}"
                  f"{'  <- current' if now else ''}")

    if timing:
        rtf = [t["asr"] / t["duration"] for t in timing]
        print(f"\nASR RTF over {len(timing)} fresh scan(s): median "
              f"{statistics.median(rtf):.3f}, max {max(rtf):.3f}")


if __name__ == "__main__":
    main()
