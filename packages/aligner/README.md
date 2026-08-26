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
prints without writing; `--limit N` bounds a run; `--all` re-aligns
already-timed renditions (after a matcher improvement); `--only <id-prefix>`
restricts to one; `--single` skips the second ASR pass (3x cheaper, blurrier
boundaries — not recommended for publishing).

Roughly RTF 0.83 on Apple Silicon: a 10-minute rendition costs ~8 minutes,
once, ever. ASR output caches in `cache/` so re-running the matcher is free.

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
