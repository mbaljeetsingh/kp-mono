"""Blind scan: which shabads a recording contains, where, and their lyrics.

No shabad_id is given. Confident regions become renditions with status
'shabad_linked' and source 'scan', which the shabads view never serves, and
each arrives with its line_timings already computed — align runs here, on the
same transcript, so publishing a scan draft needs no night's wait for lyrics.
A human reviews the boundaries in the tagger and publishes. Nothing publishes
itself unless AUTO_PUBLISH is set, and even then only drafts whose verdict
clears every gate (scan_verdict records it on every draft, set or not).

What a person published is settled. The scan never edits or removes a
rendition, skips a shabad already tagged on the recording, and suggests
nothing — draft or pointer — lying mostly inside a published one.

Two ways to run it:

    SB_KEY=... TRACK=<id> python scan_track.py [--write-drafts]
    SB_KEY=... python scan_track.py --from-queue [--limit N] [--track <id>]
                                    [--deadline-min M] [--backfill N]

Queue mode consumes scan_requests (the admin button writes rows there), oldest
first — failed ones last — and stamps done_at whether or not anything was
confident enough to draft: "scanned, nothing found" must not look like "still
waiting". It writes started_at, run_url and, on failure, error for the tag
page. It re-reads the queue after every track, so a run drains it, requests
made while it runs included. `--track` limits it to one request, for scanning
one recording on demand. `--backfill N` then scans up to N recordings nobody
asked for (see backfill_pick); requests always go first.

Method, measured against prod's published renditions (eval_scan.py):

1. Align's own two passes over the WHOLE recording — 15 s windows every 5 s
   sliced from one forward pass, 8 s every 2 s run alone — cached per track
   (timing.transcribe; write_timings.py reads the same transcript).
   The old sparse grid (15 s every 30 s) heard half the audio; its edges were
   off by 19 s at the median and cut ~77 s off each shabad.
2. Shortlist the shabads whose lines win the most windows across the Guru
   Granth Sahib and Bhai Gurdas Ji's Vaaran (corpus.py). BaniDB word search
   stopped finding the right shabad under the CTC model.
3. Per-second evidence for every shortlisted shabad (best line, both passes),
   smoothed over a minute to find stable regions, then quotes dropped, runs
   merged and the gate applied (confidence, margin, length).
4. Each draft's edges placed again from lightly smoothed evidence: from the
   first and last strong second inside it, outward while the singing holds.
5. Align on the draft's span of the same transcript: its confidence is a
   second, independent gate, and its timings are the draft's lyrics.

Margin matters as much as confidence: a 0.61/+0.01 region is a coin flip, not
a tag.
"""

import os
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone

import numpy as np
from rapidfuzz import fuzz, process

import align
import corpus
import timing
from runtime import MIN_CONFIDENCE, SB, api

FLOOR = 0.60            # per-second evidence a shabad needs to hold a region
MIN_MARGIN = 0.05       # the floor itself is runtime.MIN_CONFIDENCE
MIN_DRAFT_SEC = 60      # shorter regions are pointers (see is_draft)
QUOTE_MAX_SEC = 90      # a run this short inside another shabad is a quote
MERGE_ACROSS_SEC = 300  # one shabad either side of only pointers is one draft
SETTLED = 0.5           # this much inside published renditions: not suggested
# Routine banis, sung in nearly every program rather than chosen for it: So
# Dar closing the evening (27 in Japji, 40 opening Rehras — they read alike,
# so either can win), the Pavan Guru salok (39), Anand Sahib (333375) closing
# most programs, Basant ki Vaar (4234) through its season. The scan finds them
# right, but taggers rarely make renditions of them: as drafts they only
# fill Review, and each one deleted would count as a rejection in the
# auto-publish trial. So they are pointed at, never drafted.
ROUTINE = {27, 39, 40, 333375, 4234}
REGION_SMOOTH = 61      # seconds of evidence averaged to find regions
MIN_RUN_SEC = 10        # a run shorter than this is noise, not a region
# Edges, placed again per draft: evidence smoothed over EDGE_SMOOTH s, walked
# outward while it stays >= EDGE_FLOOR with gaps of at most EDGE_GAP s.
# Chosen on 25 prod renditions: median edge error 19.5 s -> 7.2 s.
EDGE_SMOOTH, EDGE_FLOOR, EDGE_GAP = 5, 0.60, 10
# Each shortlisted shabad costs one BaniDB fetch; 8 crowded a real shabad off
# the list on a prod recording whose shortlist was full of routine banis.
TOP_CANDIDATES = 16
CACHE = timing.CACHE

# Auto-publish verdict. Recorded on every draft (scan_verdict), acted on only
# with AUTO_PUBLISH=1 — the shadow period compares what it WOULD have
# published with what people did. Measured on the dense scale over prod's 48
# published renditions (eval_scan.py, run 36376143405): this band held 50 of
# the 140 drafts, 26 of them over tagged time, none wrong. The next looser
# band (0.70 / 0.10 / 120 s / 0.75) had one wrong in 32. 0 of 26 still allows
# an error rate of up to ~11%, which is what the shadow weeks are for.
AUTO_MIN_CONFIDENCE = 0.72
AUTO_MIN_MARGIN = 0.12
AUTO_MIN_SEC = 180
AUTO_MIN_ALIGN = 0.78
AUTO_PUBLISH = os.environ.get("AUTO_PUBLISH") == "1"


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


def shortlist(long_w, store=True):
    """{shabad_id: (verses, lines, cand)} for the TOP_CANDIDATES shabads whose
    lines win the most windows (corpus.py), texts fetched from BaniDB."""
    top = corpus.shortlist(long_w, TOP_CANDIDATES, CACHE, store)
    print(f"  candidates: {top}")
    return {sid: timing.shabad_lines(sid) for sid, _ in top}


def evidence(long_w, short_w, shabads, n):
    """[shabad x second] best-line match, the mean of every window covering
    that second, half from each pass — the scan's view of what is sung when."""
    sids = list(shabads)
    # Every sung line of every candidate, one block of columns per shabad, so
    # the best line per shabad is a reduceat — align.score's own comparison
    # (folded partial ratio), run as one matrix across every core.
    lines, starts = [], []
    for s in sids:
        starts.append(len(lines))
        lines += [align.fold(shabads[s][1][j]["text"]) for j in shabads[s][2]]
    halves = []
    for windows in (long_w, short_w):
        acc, cnt = np.zeros((len(sids), n)), np.zeros(n)
        if windows and sids:
            m = process.cdist([align.fold(w["text"]) for w in windows], lines,
                              scorer=fuzz.partial_ratio, workers=-1)
            best = np.maximum.reduceat(m, starts, axis=1) / 100.0
            for w, row in zip(windows, best):
                a, b = int(w["start"]), min(int(w["end"]), n)
                if a < b:
                    cnt[a:b] += 1
                    acc[:, a:b] += row[:, None]
        halves.append(acc / np.maximum(cnt, 1))
    # Less each shabad's chance above a typical one's (corpus.chance): Oankar
    # loses 0.13, the published shabads 0-0.06. With the Kabit in the corpus,
    # on prod's published renditions (three coarse tags split by hand, #84):
    # found 0.88 -> 0.96, puratan 15/22 -> 20/22, wrong drafts 1 -> 0, and
    # the auto-publish band still 0 wrong.
    excess = corpus.chance({s: lines[a:b] for s, a, b in
                            zip(sids, starts, starts[1:] + [len(lines)])}, CACHE)
    ev = 0.5 * halves[0] + 0.5 * halves[1]
    return sids, ev - np.array([excess[s] for s in sids])[:, None]


def _smooth(v, width):
    """Centred moving average over the seconds that exist. Plain zero-padded
    convolution read the first and last half-width of every recording as
    quiet (0.80 became 0.41 at t=0 over 61 s), which started every puratan
    file's shabad late; and for a recording shorter than the kernel it returned
    more values than there are seconds."""
    k = np.ones(max(1, min(width, len(v))))
    return (np.convolve(v, k, mode="same")
            / np.convolve(np.ones(len(v)), k, mode="same"))


def regions_from(sids, ev, floor=FLOOR):
    """Runs of seconds one shabad wins at `floor` or better, on evidence
    smoothed over REGION_SMOOTH s -> (start, end, shabad_id, mean confidence,
    mean margin over the runner-up).

    A minute of smoothing is what keeps a region whole: per-second evidence
    flickers to a near-identical shabad for a few seconds at a time, and at
    15 s of smoothing that cut the ends off real renditions (2,108 s of tagged
    time lost on 25 prod renditions, against 586 s at 61 s). The edges it
    blurs are placed again, per draft, by refine_edges."""
    if not sids:
        return []
    sm = np.array([_smooth(r, REGION_SMOOTH) for r in ev])
    order = np.sort(sm, 0)
    top = order[-1]
    second = order[-2] if len(sids) > 1 else np.zeros_like(top)
    best = sm.argmax(0)
    lab = [int(b) if v >= floor else -1 for b, v in zip(best, top)]
    out, i = [], 0
    while i < len(lab):
        j = i
        while j + 1 < len(lab) and lab[j + 1] == lab[i]:
            j += 1
        if lab[i] >= 0 and j + 1 - i >= MIN_RUN_SEC:
            out.append((float(i), float(j + 1), sids[lab[i]],
                        float(top[i:j + 1].mean()),
                        float((top[i:j + 1] - second[i:j + 1]).mean())))
        i = j + 1
    return out


def refine_edges(drafts, sids, ev):
    """Each draft's start and end, placed from EDGE_SMOOTH-s evidence: anchor
    on its first and last strong second, then walk outward while the shabad
    keeps scoring, never into a neighbouring draft. Starting inside and
    growing out, rather than taking the first strong second anywhere near,
    is what stops a stray match in katha pulling an edge a minute early."""
    out = []
    for k, g in enumerate(drafts):
        e = _smooth(ev[sids.index(g[2])], EDGE_SMOOTH)
        n = len(e)
        a, b = int(g[0]), min(int(g[1]), n - 1)
        strong = [t for t in range(a, b + 1) if e[t] >= EDGE_FLOOR]
        if not strong:
            out.append(g)
            continue
        lo = int(out[-1][1]) if out else 0
        hi = int(drafts[k + 1][0]) if k + 1 < len(drafts) else n - 1
        s0, t, miss = strong[0], strong[0], 0
        while t - 1 >= lo and miss <= EDGE_GAP:
            t -= 1
            s0, miss = (t, 0) if e[t] >= EDGE_FLOOR else (s0, miss + 1)
        s1, t, miss = strong[-1], strong[-1], 0
        while t + 1 <= hi and miss <= EDGE_GAP:
            t += 1
            s1, miss = (t, 0) if e[t] >= EDGE_FLOOR else (s1, miss + 1)
        out.append((float(s0), float(s1 + 1), g[2], g[3], g[4]))
    return out


def verdict(g, align_conf):
    """Would this draft publish itself? Every gate, with margin to spare."""
    t0, t1, _, conf, margin = g
    return (conf >= AUTO_MIN_CONFIDENCE and margin >= AUTO_MIN_MARGIN
            and t1 - t0 >= AUTO_MIN_SEC and align_conf >= AUTO_MIN_ALIGN)


def find_drafts(sids, ev, long_w, short_w, shabads, floor=FLOOR):
    """Everything the scan concludes about one recording: [(region, align
    confidence or None, timings)] — a draft carries its align result, a
    pointer (below either gate) carries None and no timings."""
    regions = merge_regions(regions_from(sids, ev, floor))
    drafts = refine_edges([g for g in regions if is_draft(g)], sids, ev)
    out = []
    for g in drafts:
        # The gate again, on the edges refine_edges placed: a region whose
        # singing is strong for 20 of its 65 s is not a 60-second draft.
        if not is_draft(g):
            out.append((g, None, []))
            continue
        conf, timings = timing.align_span(long_w, short_w, shabads[g[2]],
                                          g[0], g[1])
        # Align is the second gate: a region the scan believes but align,
        # reading the same audio line by line, does not, is a pointer.
        out.append((g, conf, timings) if conf >= MIN_CONFIDENCE
                   else (g, None, []))
    # Pointers, minus any a draft's refined edges grew over: that stretch is
    # the draft's shabad after all, and a pointer on it is noise.
    kept = [(g, c, t) for g, c, t in out if c is not None]
    for g in regions:
        if not is_draft(g) and not any(
                min(g[1], d[1]) - max(g[0], d[0]) > 0.5 * (g[1] - g[0])
                for d, _, _ in kept):
            out.append((g, None, []))
    return sorted(out, key=lambda x: x[0][0])


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


def _name(verse, sid):
    tr = verse.get("transliteration") or ""
    if isinstance(tr, dict):
        tr = tr.get("english") or next(iter(tr.values()), "")
    return (pretty_name(tr) or f"Shabad {sid}")[:80]


def settled_share(t0, t1, spans):
    """How much of [t0, t1] lies inside `spans`, counting an overlap once."""
    covered, edge = 0.0, t0
    for s0, s1 in sorted(spans):
        lo, hi = max(s0, edge), min(s1, t1)
        if hi > lo:
            covered += hi - lo
            edge = hi
    return covered / (t1 - t0) if t1 > t0 else 1.0


def write_drafts(track_id, found, shabads, owner=None):
    rows = api(f"{SB}/renditions?track_id=eq.{track_id}"
               f"&select=shabad_id,status,start_sec,end_sec,source,scan_verdict")
    # Already here: as people have it, and as the scanner drafted it — a scan
    # draft a tagger re-linked still records what was suggested, and that
    # suggestion has had its answer.
    existing = {r["shabad_id"] for r in rows} | {
        (r.get("scan_verdict") or {}).get("shabad_id")
        for r in rows if r.get("source") == "scan"}
    # A scan draft a person deleted is a rejection: that shabad is not
    # suggested here again, as a draft or as a pointer
    # (20260930010000_rejected_scan_drafts.sql).
    rejected = {x["shabad_id"] for x in api(
        f"{SB}/scan_rejections?track_id=eq.{track_id}&select=shabad_id")}
    # What a person published is settled. The scan still hears those minutes —
    # the transcript is the recording's, and the edges of a shabad beside a
    # published one are placed from the audio around them — but it does not
    # second-guess them: a region lying mostly inside published renditions is
    # usually a pangti quoted in the vichar, or a wrong match, and as a draft
    # or a pointer it is only something for a reviewer to dismiss. Here and not
    # in find_drafts, because eval_scan.py scores the scan against exactly
    # those renditions.
    published = [(float(r["start_sec"]), float(r["end_sec"]))
                 for r in rows if r["status"] == "published"]
    drafted = 0
    findings = []
    for g, align_conf, timings in found:
        t0, t1, sid, conf, margin = g
        verses, _, cand = shabads[sid]
        if settled_share(t0, t1, published) >= SETTLED:
            print(f"  leaving {t0:.0f}-{t1:.0f}s alone (shabad {sid}): "
                  f"it lies inside a published rendition")
            continue
        if sid in rejected:
            print(f"  not suggesting shabad {sid} ({t0:.0f}-{t1:.0f}s): "
                  f"rejected on this recording")
            continue
        if align_conf is None or sid in ROUTINE:
            print(f"  not drafting shabad {sid} ({t0:.0f}-{t1:.0f}s): "
                  + ("a routine bani, pointed at" if sid in ROUTINE else
                     f"conf {conf:.2f} margin {margin:+.2f}, {t1 - t0:.0f}s "
                     f"below gate"))
            # Refusing to draft must not mean refusing to tell: this becomes a
            # listen-here pointer in the tagger (scan_requests.findings).
            findings.append({"shabad_id": sid,
                             "name": _name(verses[cand[0]], sid),
                             "start": round(t0, 1), "end": round(t1, 1),
                             "confidence": round(conf, 2),
                             "margin": round(margin, 2)})
            continue
        if sid in existing:
            print(f"  shabad {sid} already has a rendition here, skipping")
            continue
        # Anchor = the line the audio dwells on longest. The dominant line
        # agreed with the tagger's hand-picked main_verse_id on every
        # correctly-tagged rendition, so it is what a listener knows this
        # rendition by — which is exactly what the name is for.
        held = {}
        for t in timings:
            held[t["verse_id"]] = held.get(t["verse_id"], 0) \
                + t["end"] - t["start"]
        by_id = {v["verseId"]: v for v in verses}
        verse = by_id[max(held, key=held.get)] if held else verses[cand[0]]
        auto = verdict(g, align_conf)
        publish = AUTO_PUBLISH and auto
        row = api(f"{SB}/renditions", method="POST", body={
            "track_id": track_id,
            "start_sec": round(t0, 2), "end_sec": round(t1, 2),
            "name": _name(verse, sid), "shabad_id": sid,
            "main_verse_id": verse["verseId"],
            "status": "published" if publish else "shabad_linked",
            "source": "scan",
            # Lyrics now, not after publish and a night's align run. The
            # re-cut trigger clears them if a tagger moves an edge, and
            # write_timings re-times it as for any rendition.
            "line_timings": timings or None,
            # The edges are in it: a tagger who re-cuts the draft changes
            # start_sec/end_sec, and the verdict must still say what it judged.
            # shabad_id too: a tagger who re-tags the draft changes the row's,
            # and the trial (scan_draft_outcomes) has to see that it did.
            "scan_verdict": {"start": round(t0, 2), "end": round(t1, 2),
                             "shabad_id": sid,
                             "confidence": round(conf, 3),
                             "margin": round(margin, 3),
                             "align_confidence": round(align_conf, 3),
                             "auto": auto, "published": publish},
            # The draft belongs to whoever requested the scan. Without this
            # the renditions SELECT policy (published OR own OR reviewer)
            # hides scan drafts from the very tagger who asked for them.
            "created_by": owner,
        }, extra={"Prefer": "return=representation"})
        existing.add(sid)
        drafted += 1
        print(f'  {"PUBLISHED" if publish else "DRAFT"} {row[0]["id"][:8]}  '
              f'{t0:6.0f}-{t1:6.0f}s  shabad {sid}  conf {conf:.2f}  '
              f'align {align_conf:.2f}  {len(timings)} lines timed'
              f'{"  (would auto-publish)" if auto and not publish else ""}'
              f'  "{_name(verse, sid)[:44]}"')
    return drafted, findings


# Background scanning (#41): when nobody has asked, a nightly run scans up to
# --backfill N recordings itself. Runner minutes are free (the repo is
# public); a reviewer's attention is not, which is what N rations. Ragi-wise
# only: a puratan file is one shabad, which its tag page names from the
# filename the moment it opens. The crawl's new ones first, newest first, then
# the backlog — in id order, which is a stable shuffle: ids are hashes.
BACKFILL_NEW_DAYS = 14
# No longer than this: a click made while a background scan runs waits for it,
# and SGPC filenames carry typos ("3.00 am to 6.05 pm" for a 6.05 am start)
# that read as a 15-hour broadcast.
BACKFILL_MAX_SEC = 120 * 60


def next_request(only, tried):
    """The next queued request — someone's click before anything the scanner
    queued for itself, however long ago that was, and failed ones after the
    rest within each. A background request that failed is not retried by
    itself: a person's Scan again makes it theirs, and a run follows."""
    q = (f"{SB}/scan_requests?done_at=is.null"
         + (f"&track_id=eq.{only}" if only else "")
         + (f"&track_id=not.in.({','.join(tried)})" if tried else "")
         + "&order=error.asc.nullsfirst,requested_at.asc&limit=1"
         "&select=track_id,requested_by")
    return (api(q + "&requested_by=not.is.null")
            or api(q + "&requested_by=is.null&error=is.null"))


def backfill_pick(left_min):
    """Queue the next recording nobody asked for: ragi-wise, nothing tagged,
    never requested, still on sgpc.net, and short enough to finish in what is
    left of the run. True when one was queued.

    Into scan_requests with no requester, and the loop takes it like any
    other: the row keeps it from being picked again, and it starts no run of
    its own (dispatch_scan fires for requested rows only)."""
    # Z, not +00:00: a "+" in a query string arrives as a space.
    since = (datetime.now(timezone.utc) - timedelta(days=BACKFILL_NEW_DAYS)
             ).strftime("%Y-%m-%dT%H:%M:%SZ")
    q = (f"{SB}/tracks?tree=eq.ragiwise&missing_since=is.null"
         f"&slot_start_sec=not.is.null&slot_end_sec=not.is.null"
         f"&select=id,slot_start_sec,slot_end_sec,renditions(id),"
         f"scan_requests(track_id)&renditions=is.null&scan_requests=is.null"
         f"&limit=50")
    for tier in (f"&first_seen_at=gt.{since}&order=date.desc.nullslast,id.asc",
                 "&order=id.asc"):
        for t in api(q + tier):
            seconds = float(t["slot_end_sec"]) - float(t["slot_start_sec"])
            # The scan of a recording starts only if it ends before the
            # deadline: what is left after it is the headroom under
            # timeout-minutes, and a click's own scan may need it.
            if not 0 < seconds <= BACKFILL_MAX_SEC or (
                    left_min is not None
                    and seconds * timing.CI_RTF / 60 > left_min):
                continue
            api(f"{SB}/scan_requests", method="POST",
                body={"track_id": t["id"]},
                extra={"Prefer": "resolution=ignore-duplicates"})
            print(f"── queued {t['id']} by itself ({seconds / 60:.0f} min, "
                  f"nobody asked)")
            return True
    return False


# Where this run is, for the tag page's "view run" (scan_requests.run_url):
# GitHub sets these in every step's environment. None off a runner.
RUN_URL = (f"{os.environ['GITHUB_SERVER_URL']}/"
           f"{os.environ['GITHUB_REPOSITORY']}/actions/runs/"
           f"{os.environ['GITHUB_RUN_ID']}"
           if os.environ.get("GITHUB_RUN_ID") else None)


def reason(e):
    """Why a request failed, in words a tagger can act on. The tag page shows
    it beside Scan again; ffmpeg's own message is its whole command line."""
    if isinstance(e, subprocess.CalledProcessError) and "ffmpeg" in str(e.cmd):
        return "could not fetch the recording from sgpc.net"
    return str(e)[:300] or type(e).__name__


def scan(track_id, drafts, owner=None):
    rows = api(f"{SB}/tracks?id=eq.{track_id}"
               f"&select=url,artist_dir,date,missing_since")
    if not rows or rows[0]["missing_since"] is not None:
        print(f"── {track_id}: gone from sgpc.net, nothing to scan")
        return 0, []
    track = rows[0]
    print(f"── {track['artist_dir']}  {track['date']}  ({track_id})")
    long_w, short_w = timing.transcribe(track_id, track["url"])
    if not long_w:
        return 0, []
    shabads = shortlist(long_w)
    n = int(max(w["end"] for w in long_w)) + 1
    sids, ev = evidence(long_w, short_w, shabads, n)
    found = find_drafts(sids, ev, long_w, short_w, shabads)
    for (t0, t1, sid, conf, margin), a, _ in found:
        print(f"  {t0:6.0f}-{t1:6.0f}s  shabad {sid}  conf {conf:.2f}  "
              f"margin {margin:+.2f}"
              + (f"  align {a:.2f}" if a is not None else "  (pointer)"))
    if not drafts:
        return 0, []
    return write_drafts(track_id, found, shabads, owner)


if __name__ == "__main__":
    if "--from-queue" in sys.argv:
        # Without --limit a run drains the queue, which is what scan.yml wants
        # (it bounds the clock with --deadline-min instead); `pnpm scan` on a
        # laptop passes one.
        limit = int(sys.argv[sys.argv.index("--limit") + 1]) \
            if "--limit" in sys.argv else None
        # --track: exactly one request, for scanning one recording on demand
        # (scan.yml's track_id input). Still a request — it must be queued —
        # so done_at, findings and the draft's owner are stamped the same way.
        only = sys.argv[sys.argv.index("--track") + 1] \
            if "--track" in sys.argv else None
        # A count does not bound the clock: six 3-hour recordings at align's
        # RTF are ~4.5 hours against a 3-hour job timeout. Stop STARTING
        # requests past the deadline; the rest wait for the next run.
        deadline = int(sys.argv[sys.argv.index("--deadline-min") + 1]) \
            if "--deadline-min" in sys.argv else None
        # --backfill N: once the requests are done, up to N recordings nobody
        # asked for (scan.yml's nightly run). Never with --track.
        backfill = int(sys.argv[sys.argv.index("--backfill") + 1]) \
            if "--backfill" in sys.argv and not only else 0
        print(f"scan queue: oldest first"
              f"{f', at most {limit}' if limit else ''}"
              f"{f', only {only}' if only else ''}"
              f"{f', starting nothing after {deadline} min' if deadline else ''}"
              f"{f', then up to {backfill} nobody asked for' if backfill else ''}"
              f"{'  AUTO_PUBLISH on' if AUTO_PUBLISH else ''}\n")
        started = time.monotonic()
        tried = []
        while limit is None or len(tried) < limit:
            if deadline and (time.monotonic() - started) / 60 > deadline:
                print(f"── stopping: past --deadline-min {deadline}; the rest "
                      f"stay queued for the next run")
                break
            # Re-read after every track instead of fetching the queue once: a
            # request made while this run is going must be taken by it. Every
            # request dispatches a run (20260930000000_dispatch_scan_and_align
            # .sql), but GitHub keeps one PENDING run per concurrency group and
            # cancels the older, so a click during a run may end up with no run
            # of its own — this loop is what still scans it. Tracks tried here
            # are skipped, so a failure is not retried in a loop.
            #
            # Failed requests after the rest: a track that fails slowly —
            # partway through a long ASR — sat at the head of every run, and
            # every new click waited behind it. It is still retried, last.
            nxt = next_request(only, tried)
            # Nothing asked for: queue one the scanner picks itself, and take
            # it on the next pass like any request — which also lets a click
            # on that very recording, landed meanwhile, keep its requester.
            if not nxt and backfill:
                left = (deadline - (time.monotonic() - started) / 60
                        if deadline else None)
                if backfill_pick(left):
                    backfill -= 1
                    continue
            if not nxt:
                break
            q = nxt[0]
            tried.append(q["track_id"])
            # One broken track (dead URL tonight, BaniDB hiccup) must not
            # wedge the whole queue: the oldest request would otherwise be
            # retried first every night, and everything behind it starves.
            # No done_at on failure — a transient error deserves a retry.
            # Taken, and by which run, first: the tag page says "Scanning…
            # (view run)" from this, and a stale error from the last attempt
            # must not still be showing while this one runs.
            row = f"{SB}/scan_requests?track_id=eq.{q['track_id']}"
            try:
                api(row, method="PATCH", body={
                    "started_at": "now()", "run_url": RUN_URL, "error": None})
                n, found = scan(q["track_id"], drafts=True,
                                owner=q["requested_by"])
            except Exception as e:
                print(f"  FAILED, leaving queued for retry: {e}\n")
                # Best-effort: the reason is for the tag page, and a database
                # that is down cannot be told anyway.
                try:
                    api(row, method="PATCH", body={"error": reason(e)})
                except Exception:
                    pass
                continue
            # Done even when nothing was drafted — "scanned, nothing found"
            # must not look like "still waiting" or it re-queues forever.
            # Findings replace wholesale: they describe THIS scan.
            api(row, method="PATCH",
                body={"done_at": "now()", "findings": found or None})
            print(f"  marked done ({n} draft(s), "
                  f"{len(found)} listen-here pointer(s))\n")
        if only and not tried:
            # Failed, not green: the person who ran this is waiting for drafts.
            sys.exit(f"{only} has no pending scan request — click Suggest "
                     f"shabads (or Scan again) on it first.")
    else:
        scan(os.environ["TRACK"], drafts="--write-drafts" in sys.argv)
