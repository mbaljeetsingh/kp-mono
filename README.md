# kp-mono — Kirtan Player

Search, play, and tag 20 years of kirtan from Sri Harmandir Sahib.

See [docs/BRD.md](docs/BRD.md), [docs/PRD.md](docs/PRD.md), and
[docs/sgpc-api.md](docs/sgpc-api.md) (verified source-API reference).

## Layout

```
apps/player/       public listening app — account optional (favorites, playlists)
apps/admin/        tagging workbench — auth required (SPA)
packages/crawler/  crawls sgpc.net → JSON → Postgres. Runs on cron, not in an app.
packages/shared/   shared types
supabase/          migrations
```

## Running locally

```bash
pnpm install
npx supabase start                              # Postgres + Auth + Studio
node --experimental-strip-types packages/crawler/src/seed.ts          # tracks
node --experimental-strip-types packages/crawler/src/seed-artists.ts  # photos
pnpm --filter @kp/player dev                    # → :3000
pnpm --filter @kp/admin  dev --port 3001        # → :3001
```

`pnpm seed` and `pnpm seed:artists` are the same two steps with the local
`SECRET_KEY` filled in for you.

Nothing about the crawl is committed — `packages/crawler/out` is gitignored, and
the seeders write to whatever `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` point
at, defaulting to the local stack. So loading a deployed project is the same two
commands with that project's values in the environment, from anywhere:

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_KEY=<service key> \
  node --experimental-strip-types packages/crawler/src/seed-artists.ts
```

The service key bypasses RLS, so it belongs in a CI secret or a shell that does
not keep history — never in an app or a committed file.

Re-crawl (~670 requests, ~11 min) with
`node --experimental-strip-types packages/crawler/src/crawl.ts`, then re-seed.
The crawl is a full nightly re-crawl by design: incremental logic costs the same
number of requests and adds a class of bugs where changes are silently missed.

**After any `supabase db reset`, run `seed-artists.ts` too.** Object bytes live
outside Postgres, so a reset (or restoring a `pg_dump` into a fresh project)
brings back the `artists.photo_path` values while the images themselves are
gone — the ragi tiles go blank with nothing in the database to explain it. The
bucket itself is a migration now, so it always exists; only the uploads need
replaying, and they are idempotent.

## Notes

- **Audio is never proxied.** It streams straight from sgpc.net, which serves
  `206` with `accept-ranges: bytes` behind Cloudflare from any origin.
- **Track ids are content-keyed, never URL-derived.** SGPC has reorganised this
  archive once already; URL-keyed ids would orphan every tag on the next move.
- **No Web Audio** — the MP3s send no CORS headers, so waveforms and visualizers
  are unavailable without proxying. Playback and scrubbing are unaffected.
- **Listening never requires an account.** Signing in (email + password, same
  `auth.users` as admin) only moves favorites off one device and unlocks
  playlists. Guests keep favorites in localStorage, and that list migrates into
  the account on first sign-in. Player auth is client-side only — the Supabase
  client persists no session on the server, so SSR renders every page
  signed-out and personalises after hydration.
