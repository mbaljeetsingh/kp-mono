# kp-mono — Kirtan Player

Search, play, and tag 20 years of kirtan from Sri Harmandir Sahib.

See [docs/BRD.md](docs/BRD.md), [docs/PRD.md](docs/PRD.md), and
[docs/sgpc-api.md](docs/sgpc-api.md) (verified source-API reference).

## Layout

```
apps/player/       public listening app — no login required
apps/admin/        tagging workbench — auth required (SPA)
packages/crawler/  crawls sgpc.net → JSON → Postgres. Runs on cron, not in an app.
packages/shared/   shared types
supabase/          migrations
```

## Running locally

```bash
pnpm install
npx supabase start                              # Postgres + Auth + Studio
node --experimental-strip-types packages/crawler/src/seed.ts   # load the crawl
pnpm --filter @kp/player dev                    # → :3000
pnpm --filter @kp/admin  dev --port 3001        # → :3001
```

Re-crawl (~670 requests, ~11 min) with
`node --experimental-strip-types packages/crawler/src/crawl.ts`, then re-seed.
The crawl is a full nightly re-crawl by design: incremental logic costs the same
number of requests and adds a class of bugs where changes are silently missed.

## Notes

- **Audio is never proxied.** It streams straight from sgpc.net, which serves
  `206` with `accept-ranges: bytes` behind Cloudflare from any origin.
- **Track ids are content-keyed, never URL-derived.** SGPC has reorganised this
  archive once already; URL-keyed ids would orphan every tag on the next move.
- **No Web Audio** — the MP3s send no CORS headers, so waveforms and visualizers
  are unavailable without proxying. Playback and scrubbing are unaffected.
