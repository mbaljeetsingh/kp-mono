# kp-aligner

Maps seconds of kirtan audio to lines of Gurbani, so the player's lyrics panel
can follow the singing. Runs out-of-band — by hand or on cron, never in an app
— and writes to `renditions.line_timings`, which the `shabads` view exposes and
`LyricsPanel.vue` reads against `currentTime`.

Method, measurements, and everything that was tried and measured worse are in
[docs/line-alignment-prototype.md](../../docs/line-alignment-prototype.md) and
[issue #30](https://github.com/mbaljeetsingh/kp-mono/issues/30). Headline:
95.5% frame accuracy held-out; boundary MAE 2.61s after refinement.

## Setup

```bash
cd packages/aligner
uv venv && uv pip install -e .
```

`ffmpeg` must be on `PATH` too — both scripts shell out to it to decode audio,
and it is not a Python dependency, so `uv` will not bring it. `brew install
ffmpeg` locally; the workflows apt-install it on the runner.

First run downloads the ASR model (~500 MB) from Hugging Face
([surindersinghssj/surt-small-v3](https://huggingface.co/surindersinghssj/surt-small-v3),
Apache-2.0). Audio is fetched from sgpc.net server-side — the browser can't
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
the second ASR pass (3x cheaper, blurrier boundaries — not recommended for
publishing).

A run that aligns nothing because every rendition at the head of the queue was
refused reports `JAMMED` and exits non-zero: nothing behind those rows can be
reached until a human reviews their tags.

Roughly RTF 0.83 on Apple Silicon: a 10-minute rendition costs ~8 minutes.
**On a CI runner it is RTF ~6, not 0.83** — there is no MPS, and cost is per ASR
window rather than per second of audio, since Whisper pads every clip to a fixed
30s mel input (an 8s window costs 7.8s of runner time, a 15s one 9.7s). Each
pass emits `duration/HOP` windows, so the hop-2 short pass alone is two thirds
of a run. Do not size a CI job off the Apple Silicon number; that mistake put
`--limit 10` and a 330-minute timeout in `align.yml` and cancelled two nights
part-way through the queue.

ASR output caches in `cache/` and in the `transcripts` bucket, so re-running the
matcher is free — but only at the same boundaries. The cache key includes them
(`{id}_{start}_{end}`), deliberately: the wav is cut at fetch time, so re-cutting
a rendition MUST miss the cache and pay the full two-pass ASR again.

## Suggest shabads for untagged recordings

```bash
pnpm scan                                        # consume the admin queue, from repo root
SB_KEY=<key> uv run python scan_track.py --from-queue --limit 3
SB_KEY=<key> TRACK=<track id> uv run python scan_track.py [--write-drafts]
```

Blind identification: ASR the broadcast, search BaniDB with the distinctive
words, score candidate shabads window-by-window, report regions where one
dominates. Queue mode consumes `scan_requests` (the *Suggest* button in admin
writes rows there; *Suggest again* re-queues a finished one), oldest first, and
stamps `done_at` even when nothing cleared the gate — "scanned, nothing found"
is an answer. A failing track is left queued for retry without blocking the
rest.

Confident regions (confidence ≥ 0.6 **and** margin ≥ 0.05 over the runner-up)
become renditions with `status = 'shabad_linked'`, `source = 'scan'`, named
from the region's dominant line, owned by whoever requested the scan —
invisible to the player until a human reviews the boundaries in the tagger and
publishes. It never publishes anything itself.

## Scheduling

Deployed: `.github/workflows/scan.yml` and `align.yml` run nightly against the
project in the repo secrets. Locally there is no scheduler on purpose — run
`pnpm pipeline` (scan, then align) after a tagging session.
