# kp-aligner

Maps seconds of kirtan audio to lines of Gurbani, so the player's lyrics panel
can follow the singing. Runs out-of-band — by hand or on cron, never in an app
— and writes to `renditions.line_timings`, which the `shabads` view exposes and
`LyricsPanel.vue` reads against `currentTime`.

Method, measurements, and everything that was tried and measured worse are in
[docs/line-alignment-prototype.md](../../docs/line-alignment-prototype.md) and
[issue #30](https://github.com/mbaljeetsingh/kp-mono/issues/30). Headline,
current model at the shipped settings: 96.2% frame accuracy on the benchmark,
boundary MAE 0.86s against its ground truth.

## Setup

```bash
cd packages/aligner
uv venv && uv pip install -e .
```

`ffmpeg` must be on `PATH` too — both scripts shell out to it to decode audio,
and it is not a Python dependency, so `uv` will not bring it. `brew install
ffmpeg` locally; the workflows apt-install it on the runner.

First run downloads the ASR model (184 MB, int8 ONNX) from Hugging Face
([karansea/indicconformer-stt-pa-ctc-shabad-preview](https://huggingface.co/karansea/indicconformer-stt-pa-ctc-shabad-preview),
MIT), pinned to one revision in `runtime.py`. CPU only, via onnxruntime — no
torch, no GPU. Audio is fetched from sgpc.net server-side — the browser can't
(no CORS), which is why this whole package exists outside the apps.

## Align published renditions

```bash
pnpm align                                                     # local stack, from repo root
SB_URL=https://<ref>.supabase.co/rest/v1 SB_KEY=<key> \
  uv run python write_timings.py                               # deployed
```

The queue is the data: every **published** rendition with `shabad_id` set and
`line_timings` null gets aligned — publish is the human verification the
compute waits for, and re-cutting a rendition's boundaries re-queues it
automatically (a trigger clears its timings). Renditions whose audio does not
match their tagged shabad (confidence < 0.6) are **skipped and reported**, not
written — that gate has already caught one real mistag. Flags: `--dry-run`
prints without writing; `--limit N` caps how many renditions a run ALIGNS
(refused ones do not count against it, so a permanently mistagged row cannot
starve the queue); `--deadline-min N` stops starting renditions that will not
fit in N minutes, which is the bound a CI timeout actually enforces; `--all`
re-aligns already-timed renditions (after a matcher improvement); `--only
<id-prefix>` restricts to one and overrides `--limit`, so a targeted run cannot
silently miss a rendition that is not among the oldest rows; `--single` skips
the second ASR pass (~3x cheaper, blurrier boundaries — not recommended for
publishing).

A run that aligns nothing because every rendition at the head of the queue was
refused reports `JAMMED` and exits non-zero: nothing behind those rows can be
reached until a human reviews their tags.

Cost is ~0.24x the rendition's duration on a CI runner (measured: long pass
RTF 0.075, short pass 0.164), so a 10-minute set takes 2-3 minutes. The long
pass is one forward pass over the recording with each window sliced out of it;
the short pass runs every 8s window on its own, because sliced frames hear
past the window's edge and put transitions early. `--single` skips the short
pass. The model it replaced, surt-small-v3 (Whisper), was RTF ~9 on the same
runner — every window padded to a 30s mel input — which is why the nightly
limits in `align.yml` were once 3 renditions in 330 minutes.

ASR output caches in `cache/` and in the `transcripts` bucket, so re-running the
matcher is free — but only at the same boundaries and the same model. The key
includes both (`{id}_{start}_{end}_{pass}_{runtime.MODEL_TAG}`), deliberately:
the wav is cut at fetch time, so re-cutting a rendition MUST miss the cache,
and another model's text is a different confidence scale, not a hit.

## Suggest shabads for untagged recordings

```bash
pnpm scan                                        # consume the admin queue, from repo root
SB_KEY=<key> uv run python scan_track.py --from-queue --limit 3
SB_KEY=<key> uv run python scan_track.py --from-queue --track <track id>   # one queued recording
SB_KEY=<key> TRACK=<track id> uv run python scan_track.py [--write-drafts]
```

Deployed, a click is the whole step: _Suggest shabads_ (or _Scan again_) in
admin queues the recording and a database trigger starts `scan.yml` at once
(see Scheduling). Actions → scan → Run workflow with a `track_id` scans one
queued recording by hand.

Blind identification, with lyrics. The scan runs align's own two passes over
the whole recording (cached per track under `track/` in the `transcripts`
bucket) and reads everything off that one transcript:

1. **Shortlist** the 16 shabads whose lines win the most windows across the
   Guru Granth Sahib and Bhai Gurdas Ji's Vaaran (`corpus.py`, fetched once
   from BaniDB's ang endpoint). BaniDB word search on CTC transcripts missed
   the right shabad on most recordings.
2. **Regions** from per-second evidence per shortlisted shabad, smoothed over a
   minute; a short run of one shabad between two runs of another is a quote
   from vichar and is dropped; the same shabad either side of only weak runs
   is one region.
3. **Gate**: confidence ≥ 0.6, margin ≥ 0.05 over the runner-up, at least 60 s.
4. **Edges** placed again from 5 s evidence, grown outward from inside.
5. **Align** on the draft's span: its confidence is a second gate (below 0.6
   the region is a pointer), its timings are the draft's `line_timings`.

Drafts are renditions with `status = 'shabad_linked'`, `source = 'scan'`,
lyrics timed, named from the line sung longest, owned by whoever requested
the scan, and a `scan_verdict` saying whether it would have published itself
(`AUTO_PUBLISH=1` acts on that; nothing sets it). Invisible to the player until
a human reviews the edges and publishes — no night's wait for lyrics after.
Deleting a scan draft is a rejection: a trigger writes it to
`scan_rejections` (the drafted shabad, span, status, verdict, who), and the scan
never suggests that shabad on the recording again. To restore one, delete its
row there in the SQL editor. The auto-publish trial reads rejections beside the
drafts still standing, in `scan_draft_outcomes`:

```sql
select auto, outcome, count(*) as drafts,
       round(avg(start_moved_sec + end_moved_sec)
             filter (where outcome = 'edges moved'), 1) as avg_moved_sec
from scan_draft_outcomes group by auto, outcome order by auto desc, outcome;
```

`auto` = the draft cleared every auto-publish gate; the trial asks how often
those end anywhere but `published as drafted`. A draft from before the scanner
recorded its drafted shabad, edited before this was added, reads `published,
shabad unknown`: whether it was re-tagged is lost.

Published parts are left alone: the scan never edits a rendition, skips a
shabad already tagged on the recording, and drafts nothing — nor points at
anything — lying mostly inside a published one (`SETTLED`, in `write_drafts`
rather than the matching, since `eval_scan.py` scores against those renditions).
Queue mode consumes `scan_requests` oldest first, re-reading it after each
track so one run drains it, and stamps `done_at` even when nothing cleared the
gate; a failing track is left queued for retry.

Cost: align's RTF, ~0.24 on a runner — ~9 minutes for a 35-minute duty. On
prod's published tags (25 renditions, 17 recordings) against the old sparse
scan: found 0.88 → 0.96, median edge error 19.5 s → 7.2 s.

## Measure the scan against published tags

```bash
SB_URL=https://<ref>.supabase.co/rest/v1 SB_KEY=<key> \
  uv run python eval_scan.py [--limit N] [--exclude-shabad ID ...]
uv run python eval_scan.py --shard 3/8 --out results    # one of N slices
uv run python eval_scan.py --report results             # tables over every slice
```

On prod: Actions → scan → Run workflow with `eval` ticked — 12 runners, the
report in the run summary.

Runs the scan over every track with a published rendition and replays a grid
of `FLOOR` x `MIN_MARGIN` over the saved evidence: how many drafts name the
published shabad, name a different one, or land where nothing is tagged, how
far their edges sit from the human's, and how the auto-publish bands do. Read-only by
construction — GETs only, transcripts and the corpus kept on local disk — so it
is safe to point at prod, which has far more published tags than a local
stack. `--exclude-shabad 3590` drops the known mistag from the truth.

With no key at all, export the truth from the SQL editor and pass `--truth
truth.json` (`SB_KEY=x` still has to be set; the transcript store just misses):

```sql
select json_agg(t) from (
  select tr.id as track_id, tr.url, tr.tagged_done_at is not null as done,
         json_agg(json_build_object('shabad_id', r.shabad_id, 'start', r.start_sec,
                                    'end', r.end_sec) order by r.start_sec) as spans
  from renditions r join tracks tr on tr.id = r.track_id
  where r.status = 'published' and r.shabad_id is not null
    and tr.missing_since is null
  group by tr.id
) t;
```

## Scheduling

Deployed: `.github/workflows/scan.yml` and `align.yml` run against the project
in the repo secrets as soon as there is work for them. A database trigger
(`supabase/migrations/20260930000000_dispatch_scan_and_align.sql`) dispatches
`scan.yml` when a scan request is queued or re-queued, and `align.yml` when a
rendition enters align's queue — published, shabad linked, no timings. Both
also run nightly, as the sweep for anything a dispatch missed.

The trigger needs one secret, created once in the SQL editor:

```sql
select vault.create_secret('<token>', 'github_dispatch_token');
```

a fine-grained GitHub token for this repository only, with Actions: read and
write. Without it nothing is dispatched and the nightly runs do the work, as
before — which is every local database. A refused dispatch (an expired token
answers 401) shows in `net._http_response`; replace the secret with
`vault.update_secret`.

Locally there is no scheduler on purpose — run `pnpm pipeline` (scan, then
align) after a tagging session.
