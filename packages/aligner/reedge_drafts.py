"""Re-place the edges of scan drafts nobody has touched yet, once.

The scan never edits a rendition, so drafts written before place_edges keep the
edges reviewers were moving: starts on the harmonium intro (8-14 s early on
ragi duties), ends cut short of the pause. This moves them where the scan now
puts them — scan_track.place_edges on the recording's stored transcript and
audio — and re-times their lyrics on the new span.

Only untouched drafts: source 'scan', still shabad_linked, edges and shabad
exactly as the verdict recorded them. Anything a person moved, re-tagged,
published or deleted is left alone, and a draft whose shabad align no longer
believes on the new span (below MIN_CONFIDENCE) keeps its edges.

    SB_URL=<project>/rest/v1 SB_KEY=<service key> python reedge_drafts.py           # list what would move
    SB_URL=<project>/rest/v1 SB_KEY=<service key> python reedge_drafts.py --apply   # and move it

Dry unless --apply: read the list first. Each recording's audio is fetched from
sgpc.net for the end snap (~30 s each, cached in cache/); --no-end skips it and
moves only starts. Safe to run again: a re-edged draft records where it came
from in its verdict (`reedged_from`) and is not touched twice.

Two updates per draft, in this order: the edges (with the verdict's copy of
them, or scan_draft_outcomes would count the move as a reviewer's), then the
timings. The re-cut trigger clears line_timings on any update of start_sec or
end_sec, even one that sets them, so timings written alongside the edges would
be lost. No dispatch fires: align only queues published renditions.
"""

import argparse
import collections

import scan_track
import timing
from runtime import MIN_CONFIDENCE, SB, api, paged

ap = argparse.ArgumentParser()
ap.add_argument("--apply", action="store_true",
                help="write the new edges and timings; without it nothing is "
                     "written")
ap.add_argument("--no-end", action="store_true",
                help="move starts only: no audio fetched, ends stay")
ap.add_argument("--track", help="only this recording")
ap.add_argument("--limit", type=int, default=None,
                help="at most N recordings this run")
args = ap.parse_args()

MOVED = 0.5  # seconds; less is noise, not a move worth a write


def untouched(r):
    v = r["scan_verdict"] or {}
    return ("reedged_from" not in v and r["shabad_id"] == v.get("shabad_id")
            and abs(float(r["start_sec"]) - float(v.get("start", -1))) < 0.01
            and abs(float(r["end_sec"]) - float(v.get("end", -1))) < 0.01)


rows = paged(f"{SB}/renditions?source=eq.scan&status=eq.shabad_linked"
             f"&scan_verdict=not.is.null"
             f"&select=id,track_id,start_sec,end_sec,shabad_id,scan_verdict"
             f"&order=id"
             + (f"&track_id=eq.{args.track}" if args.track else ""))
by_track = collections.defaultdict(list)
skipped = collections.Counter()
for r in rows:
    if not untouched(r):
        # A verdict from before the scanner recorded its edges reads as
        # touched too: there is no telling, so it is left alone.
        skipped["edited, re-edged, or no recorded edges"] += 1
    elif r["shabad_id"] in scan_track.ROUTINE:
        # Drafted before it joined ROUTINE; the scan would only point at it now.
        skipped["routine bani"] += 1
    else:
        by_track[r["track_id"]].append(r)
tracks = sorted(by_track)[:args.limit]
print(f"{len(rows)} waiting scan drafts, "
      f"{sum(len(v) for v in by_track.values())} to look at on "
      f"{len(by_track)} recording(s); left alone: {dict(skipped)}; "
      f"this run: {len(tracks)} recording(s)"
      f"{'' if args.apply else '  (dry run: nothing is written)'}\n")

stats = collections.Counter()
starts, ends = [], []
for k in tracks:
    t = api(f"{SB}/tracks?id=eq.{k}&select=url,artist_dir,date,missing_since")
    if not t or t[0]["missing_since"] is not None:
        print(f"── {k}: gone from sgpc.net, left alone")
        stats["gone"] += len(by_track[k])
        continue
    url = t[0]["url"]
    print(f"── {t[0]['artist_dir']}  {t[0]['date']}  ({k})", flush=True)
    # The stored transcript only (asr=False, store=False): the scan made it,
    # and a run that had to transcribe would be a different job.
    tr = timing.transcribe(k, url, store=False, asr=False)
    if not tr:
        print("  no stored transcript, left alone")
        stats["no transcript"] += len(by_track[k])
        continue
    long_w, short_w = tr
    loud = None if args.no_end else timing.loudness(k, url)
    mine = sorted(by_track[k], key=lambda r: float(r["start_sec"]))
    ids = {r["id"] for r in mine}
    # Everything else on the recording bounds the moves: a draft never grows
    # into a published rendition, a reviewer's draft, or a manual tag.
    others = [(float(o["start_sec"]), float(o["end_sec"])) for o in
              api(f"{SB}/renditions?track_id=eq.{k}&select=id,start_sec,end_sec")
              if o["id"] not in ids]
    drafts = [(float(r["start_sec"]), float(r["end_sec"]), r["shabad_id"],
               r["scan_verdict"].get("confidence", 0.0),
               r["scan_verdict"].get("margin", 0.0)) for r in mine]
    for r, g, p in zip(mine, drafts, scan_track.place_edges(drafts, short_w, loud)):
        lo = max((e for s, e in others if e <= g[0] + 1), default=0.0)
        hi = min((s for s, e in others if s >= g[1] - 1), default=float("inf"))
        t0, t1 = max(p[0], lo), min(p[1], hi)
        ds, de = t0 - g[0], t1 - g[1]
        if abs(ds) < MOVED and abs(de) < MOVED:
            stats["already right"] += 1
            continue
        conf, timings = timing.align_span(long_w, short_w,
                                          timing.shabad_lines(g[2]), t0, t1)
        line = (f"  {r['id'][:8]}  shabad {g[2]:>6}  "
                f"{g[0]:7.1f}-{g[1]:7.1f}s -> {t0:7.1f}-{t1:7.1f}s  "
                f"(start {ds:+5.1f}, end {de:+5.1f})  align {conf:.2f}")
        if conf < MIN_CONFIDENCE or t1 - t0 < scan_track.MIN_DRAFT_SEC:
            print(line + "  -> left alone (would fail a gate)")
            stats["would fail a gate"] += 1
            continue
        print(line + f"  {len(timings)} lines")
        starts.append(ds)
        ends.append(de)
        stats["moved"] += 1
        if not args.apply:
            continue
        v = dict(r["scan_verdict"])
        v.update(start=round(t0, 2), end=round(t1, 2),
                 align_confidence=round(conf, 3),
                 auto=scan_track.verdict((t0, t1) + g[2:], conf),
                 reedged_from=[g[0], g[1]])
        done = api(f"{SB}/renditions?id=eq.{r['id']}"
                   f"&status=eq.shabad_linked&start_sec=eq.{r['start_sec']}"
                   f"&end_sec=eq.{r['end_sec']}", method="PATCH",
                   body={"start_sec": round(t0, 2), "end_sec": round(t1, 2),
                         "scan_verdict": v},
                   extra={"Prefer": "return=representation"})
        # Guarded on the edges it read: a reviewer who opened the draft in
        # the meantime keeps their edit, and this one is skipped.
        if not done:
            print("    changed since it was read, skipped")
            stats["moved"] -= 1
            stats["changed meanwhile"] += 1
            continue
        api(f"{SB}/renditions?id=eq.{r['id']}", method="PATCH",
            body={"line_timings": timings or None})

print(f"\n{dict(stats)}")
if starts:
    med = lambda xs: sorted(xs)[len(xs) // 2]
    print(f"median move: start {med(starts):+.1f} s, end {med(ends):+.1f} s "
          f"over {len(starts)} draft(s)"
          f"{'' if args.apply else ' — run again with --apply to write'}")
