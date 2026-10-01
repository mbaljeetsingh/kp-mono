# CLAUDE.md

Turborepo + pnpm monorepo: **Kirtan Player** — search, play and tag 20 years of kirtan from Sri Harmandir Sahib (audio streams straight from sgpc.net), plus a Python pipeline that identifies shabads in recordings and times their lyrics. [README.md](README.md) is the setup guide; [docs/architecture.md](docs/architecture.md) holds the decisions and why — read the relevant section before changing a layer.

## Layout

```
apps/player        public listening app (Vite + React + TanStack Router), account optional
apps/admin         tagging workbench ("Contribute"), auth required
apps/mobile        Expo app — exists for background audio
packages/core      @kp/core: segments, queue, read-along, coverage — the only place those rules live
packages/playback  @kp/playback: player store + audio driver seam (expo-audio | <audio>)
packages/api       @kp/api: Supabase client, Zod schemas, TanStack Query hooks (all data access)
packages/ui        shadcn/ui shared by player + admin; packages/ui-native for mobile
packages/tokens    theme + brand marks for web and native
packages/shared    types, stations, ragas
packages/crawler   sgpc.net → JSON → Postgres (cron or by hand, never in an app)
packages/aligner   Python: scan (which shabads, where) + align (line timings); see its README
supabase/          migrations + committed sample seed
```

## Commands

```bash
pnpm dev:player | dev:admin                  # :3000 / :3001 (.claude/launch.json has both)
pnpm --filter @kp/mobile ios                 # native build + simulator; then `npx expo start`
pnpm db:start                                # local Supabase: API :54521, DB :54522, Studio :54523
pnpm lint && pnpm typecheck && pnpm test     # CI runs these, plus the checks below
pnpm format:check && pnpm tokens:check && pnpm theme:check && pnpm build
pnpm pipeline                                # scan then align against the local stack
cd packages/aligner && uv venv && uv pip install -e .   # once, for the Python tools
```

CI (`.github/workflows/ci.yml`) runs tokens:check, theme:check, format:check, lint, typecheck, test and build on every PR. `scan.yml`/`align.yml` start as soon as there is work — a database trigger dispatches them (`supabase/migrations/20260930000000_dispatch_scan_and_align.sql`) — and also run nightly as a sweep; the nightly scan then scans up to eight recordings nobody asked for (ragi-wise, untagged: #41). `crawl.yml` runs weekly. All run against the deployed project. `scan.yml` can also be run by hand with a `track_id` (one queued recording), `backfill` (the nightly eight) or `eval` (read-only measurement of the scan against published tags).

## Supabase — read this before touching the database

- **Migrations are applied in production. Never edit an existing file**; every schema change is a new timestamped file in `supabase/migrations/`. Revoke-then-grant for new objects, as `authz.sql` does.
- **The remote project is read-only for agents.** No writes, DDL, `db push` or `db reset` against it. Apply and test migrations locally (`npx supabase migration up --local`); the owner pushes them. When a change needs a migration on prod before the code deploys (a new column the admin selects, say), say so in the PR.
- The Supabase MCP server points at the **local** stack (`127.0.0.1:54521`), not prod.
- The local Docker volume may hold a full 49k-track crawl and hand-tagged renditions. `supabase db reset` restores only the committed sample seed — don't reset without asking.
- The seed accounts (README) are for local testing only: `admin@kirtanplayer.com` / `contributor@kirtanplayer.com`, password `password`.
- The service key bypasses RLS: CI secrets or a history-less shell only, never an app or a committed file.
- The GitHub token the dispatch trigger uses lives in Vault (`github_dispatch_token`), created by the owner in the SQL editor — never in a migration or a file. Test the trigger locally with a dummy secret only: a real token starts real runs against prod.

## Generated or checked copies — never edit by hand

- `packages/tokens/tokens-native.css` and `colors.ts`: `pnpm tokens:generate` (tokens:check fails on drift).
- The `theme-preload` block is duplicated in `apps/player/index.html` and `apps/admin/index.html` on purpose (it must run before paint); theme:check fails if they differ.
- `supabase/seed.sql`: `pnpm seed:generate`, sampled from a database holding a full crawl.
- `scripts/netlify-ignore.sh` hand-mirrors which packages each site depends on — update it when an app starts importing a new `packages/*`.

## Conventions

- **Data access goes through `@kp/api`** (queries, schemas, hooks); domain rules through `@kp/core`. Apps don't talk to Supabase or re-derive those rules themselves.
- **ESLint enforces the rules of hooks** — that's where this codebase's bugs have lived. Don't write refs during render; see the known-warnings note in architecture.md before "fixing" one.
- **Comments explain why**, often with the incident that forced the code. Match the density of the file you're in; keep a comment accurate when the code under it changes.
- **Tests**: Vitest, in `core`, `playback` and `api`. There is no E2E; UI changes are verified in the browser (preview tools / Simulator) before they're called done.
- **Design**: gold palette, Newsreader for Latin and Noto Serif Gurmukhi for Gurbani (Google Fonts), three text tiers; mockup first for new UI.
- **Commits and PR titles**: `area[, area]: what changed, in plain words` — e.g. `aligner: …`, `player, mobile: …`, lowercase area, no conventional-commit prefixes.
- Don't add dependencies without asking. Formatting is Prettier; a PostToolUse hook formats edited files.

## The scan → align pipeline (`packages/aligner`)

- **Publishing is the only human step.** Scan drafts are `status = 'shabad_linked'`, `source = 'scan'`, invisible to the player until someone reviews the edges and publishes. Nothing sets `AUTO_PUBLISH`; `scan_verdict` records what it would have done.
- **Deleting a scan draft is a rejection.** A trigger records it in `scan_rejections`; the scan never re-suggests that shabad on the recording, and `scan_draft_outcomes` (the auto-publish trial's report) counts it. `renditions` holds only live rows.
- **Published is settled.** The scan never edits a rendition and suggests nothing mostly inside a published one. That rule lives in `write_drafts`, not the matching: `eval_scan.py` scores the scan against exactly those renditions.
- **One scale.** Scan and align share `runtime.py` (model revision, `MIN_CONFIDENCE` 0.60). A model or decoding change means re-measuring with `eval_scan.py` (read-only; `--truth` takes a SQL-editor export) before changing any threshold.
- Transcripts are cached on disk and in the `transcripts` bucket, keyed by model and by how the audio was cut: another model's text, or text cut differently, is a different scale, never a cache hit.
- The audio is fetched server-side because sgpc.net sends no CORS headers; the browser cannot read archive audio.

## Deployment

Netlify, one site per app (`apps/player/netlify.toml`, `apps/admin/netlify.toml`); each site needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` (publishable key). Mobile builds go through EAS. Merging to `main` deploys the web apps, so anything that needs a migration first must say so before merge.

## Worktrees

A SessionStart hook runs `scripts/worktree/setup.sh` in a new worktree; it symlinks the gitignored files listed in `.worktreeinclude` (the apps' and supabase `.env`) from the main checkout, so editing one edits the original.
