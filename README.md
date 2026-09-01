# kp-mono — Kirtan Player

Search, play, and tag 20 years of kirtan from Sri Harmandir Sahib.

**[Player](https://kirtanplayer.beejaysoft.com)** ·
**[Contribute](https://contribute.kirtanplayer.beejaysoft.com)** (tagging workbench)

See [docs/BRD.md](docs/BRD.md), [docs/PRD.md](docs/PRD.md), and
[docs/sgpc-api.md](docs/sgpc-api.md) (verified source-API reference).

## Layout

```
apps/player/       public listening app — account optional (favorites, playlists)
apps/admin/        tagging workbench — auth required (SPA)
packages/crawler/  crawls sgpc.net → JSON → Postgres. Runs on cron, not in an app.
packages/aligner/  Python: suggests shabads from audio, writes line timings.
                   Same shape as the crawler — cron or by hand, never in an app.
packages/shared/   shared types
supabase/          migrations
```

## Running locally

```bash
pnpm install
npx supabase start                              # Postgres + Auth + Studio
pnpm --filter @kp/player dev                    # → :3000
pnpm --filter @kp/admin  dev --port 3001        # → :3001
```

That is the whole first run: a committed seed (`supabase/seed.sql`, issue #27)
is applied automatically after migrations, so a fresh clone gets a working
player and tagging queue with no network access — ~430 tracks sampled across
all three source trees, every artist, a handful of published shabads (some
with synced lyrics), and two accounts for testing the permission split:

| account                        | password   | trust         |
| ------------------------------ | ---------- | ------------- |
| `admin@kirtanplayer.com`       | `password` | `admin`       |
| `contributor@kirtanplayer.com` | `password` | `contributor` |

The same seed makes `supabase db reset` cheap — reset, and the sample is back.
Artist photos are seeded as paths only (the images are not in git); tiles fall
back to gradients until `pnpm seed:artists` fetches them.

### The full catalogue

The seed is a sample. For all 49k tracks, crawl and load:

```bash
node --experimental-strip-types packages/crawler/src/crawl.ts         # ~11 min
node --experimental-strip-types packages/crawler/src/crawl-artists.ts # photos
node --experimental-strip-types packages/crawler/src/seed.ts          # tracks
node --experimental-strip-types packages/crawler/src/seed-artists.ts  # photos
```

The two crawl steps come first: the seeders read `out/crawl.json` and
`out/artists.json`, neither of which exists in a fresh clone. `pnpm seed` and
`pnpm seed:artists` are the same two steps with the local `SECRET_KEY` filled
in for you.

Regenerate the committed seed with `pnpm seed:generate` whenever the schema
moves or the sample should refresh — it samples a database holding a full
crawl (and refuses to run against one that doesn't).

## Shabad suggestions and synced lyrics

Two batch jobs turn tagging work into player features, both in
[packages/aligner](packages/aligner/README.md) (one-time setup:
`cd packages/aligner && uv venv && uv pip install -e .`):

- **scan** — consumes the _Suggest_ queue from admin and drafts which shabads a
  recording contains, for a human to review and publish.
- **align** — gives every _published_ rendition with a `shabad_id` its per-line
  timings, which the player's lyrics panel follows during playback.

On the deployed project these run themselves — `.github/workflows/scan.yml` and
`align.yml` nightly, `crawl.yml` weekly — once `SUPABASE_URL` and
`SUPABASE_SERVICE_KEY` exist as repo secrets. The weekly run covers all four
crawler steps, artists and photos included, so a deployed project needs no
manual seeding after the first one. Locally there is no scheduler on
purpose (a sleeping laptop makes cron a lie); after a tagging session run

```bash
pnpm pipeline
```

which is `pnpm scan && pnpm align` against the local stack, keys filled in the
same way the seed scripts do it. Publishing is the only human step in the loop:
nothing a machine wrote reaches a listener without someone reviewing the
boundaries in the workbench and pressing publish, and nothing gets lyrics
until it is published.

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
The crawl is a full re-crawl by design: incremental logic costs the same number
of requests and adds a class of bugs where changes are silently missed.

`--sample` crawls three artists per tree into `out/crawl.sample.json`. It never
writes `out/crawl.json`, and the seeder refuses a sample file even if you rename
it, because a sample crawl is a _successful_ crawl and nothing downstream could
otherwise tell the difference. A full run rotates the last good crawl to
`out/crawl.previous.json` first.

**A tree that returns nothing fails the crawl.** SGPC serves `403` to
datacentre IPs intermittently, and a tree whose root listing never arrived used
to come back as an empty array — one run reported 7,960 tracks as a complete
archive with ragiwise, 84% of it, missing. A `403` is now retried like a rate
limit, and a zero-track tree refuses to write `crawl.json` at all, so the last
good crawl survives and the workflow goes red. `--allow-partial` overrides it;
`--sample` is exempt.

**After any `supabase db reset`, run `seed-artists.ts` too.** Object bytes live
outside Postgres, so a reset (or restoring a `pg_dump` into a fresh project)
brings back the `artists.photo_path` values while the images themselves are
gone — the ragi tiles go blank with nothing in the database to explain it. The
bucket itself is a migration now, so it always exists; only the uploads need
replaying, and they are idempotent.

## Deploying

Both apps are Netlify sites off this one repo, each with its own
`netlify.toml`. The dashboard holds the rest:

| setting           | player              | admin              |
| ----------------- | ------------------- | ------------------ |
| package directory | `apps/player`       | `apps/admin`       |
| build command     | `pnpm build:player` | `pnpm build:admin` |
| publish directory | `apps/player/dist`  | `apps/admin/dist`  |

Each site needs `NUXT_PUBLIC_SUPABASE_URL` and `NUXT_PUBLIC_SUPABASE_KEY` (the
**publishable** key). Both configs refuse to build without them rather than
ship a green deploy pointing at `127.0.0.1`. Leave base and functions
directories at their defaults, and don't set `NODE_ENV` — `production` makes
pnpm skip the devDependencies the build needs.

## Notes

- **Audio is never proxied.** It streams straight from sgpc.net, which serves
  `206` with `accept-ranges: bytes` behind Cloudflare from any origin.
- **Track ids are keyed on listing metadata, never on the URL.** SGPC has
  reorganised this archive once already; URL-keyed ids would strand every tag on
  the next move. Worth stating the limit precisely, because "content-keyed" over-
  promises: the key is who/when/which-slot, so it survives a **path change** but
  not a **rename**. Only dated daywise files survive both — every other tree
  includes the filename or a title derived from it. Closing that gap is
  reconciliation (match a renamed file on its unchanged size + mtime), not a
  better hash; tracked in #26. The definition lives in one place,
  `packages/crawler/src/track-id.ts`, because it was duplicated in the crawler
  and the seeder and the copies silently drifted.
- **The seeder never deletes.** `renditions.track_id` is `ON DELETE CASCADE`, so
  dropping a track row would take its tags with it. Files that vanish from the
  archive are stamped `missing_since` instead, which every view already excludes.
  It also refuses to run on a sample crawl, on a crawl with too many errors, or
  on one that would shrink the catalogue by more than 10% — `--force` overrides
  the last two, never the first.
- **No Web Audio** — the MP3s send no CORS headers, so waveforms and visualizers
  are unavailable without proxying. Playback and scrubbing are unaffected.
- **Listening never requires an account.** Signing in (email + password, same
  `auth.users` as admin) only moves favorites off one device and unlocks
  playlists. Guests keep favorites in localStorage, and that list migrates into
  the account on first sign-in. Player auth is client-side only — the Supabase
  client persists no session on the server, so SSR renders every page
  signed-out and personalises after hydration.

## License

[MIT](LICENSE) — the code. The recordings are not ours to license: they are
published by SGPC at sgpc.net and streamed from there, never copied or
redistributed here. What this repo commits about them is catalogue metadata —
filenames, dates, artist directories — not audio.
