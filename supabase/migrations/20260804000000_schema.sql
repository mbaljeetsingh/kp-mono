-- Kirtan archive — baseline schema.
--
-- Squashed from 34 incremental migrations on 2026-08-04, while no hosted
-- project had ever applied the old chain — the last moment history was still
-- free to rewrite. The old files (and the journey: segments→renditions,
-- tag_queue→recordings, a policy system rebuilt twice) live in git history;
-- what follows is the surviving design, with the reasoning that still stands.
--
-- Two tables carry the product: `tracks` mirrors what exists on sgpc.net, and
-- `renditions` is the tagged layer we own. Everything else supports those two.
--
-- The vocabulary, because the schema only makes sense with it:
--   shabad     the scripture text — lives in BaniDB, never in this database
--   track      an audio file on sgpc.net (a 70-minute broadcast set, say)
--   rendition  one performance of a shabad by a particular ragi — a tagged
--              time range within a track, and the unit a listener plays
-- "One shabad, every rendition of it" is the sentence the archive exists to
-- make true.

create extension if not exists pg_trgm with schema extensions;

-- ── enums ─────────────────────────────────────────────────────────────────

create type source_tree as enum ('ragiwise', 'puratan', 'daywise');

-- Trust is a single earned ladder; task preference is a separate multi-select
-- that routes work and grants nothing. Conflating them is what made an
-- earlier five-role design heavy for no benefit. `blocked` exists so abuse
-- can be stopped short of deleting the account.
create type trust_level as enum ('blocked', 'contributor', 'trusted', 'reviewer', 'admin');

create type rendition_status as enum (
  'draft', 'segmented', 'shabad_linked', 'music_tagged', 'reviewed', 'published'
);

-- Capabilities, granted to roles through `role_permissions` and checked by
-- authorize(). Names are user-visible in the admin permission matrix.
create type app_permission as enum (
  'renditions.propose',    -- create a draft rendition
  'renditions.publish',    -- make a rendition visible in the player
  'renditions.review',     -- see and act on other people's drafts
  'renditions.delete',     -- remove any rendition
  'artists.edit',          -- names, bios, photos
  'users.manage'           -- assign trust levels
);

-- ── tracks ────────────────────────────────────────────────────────────────
-- One row per audio file on sgpc.net. Refreshed by a nightly full re-crawl
-- (~670 requests) which upserts on `id` and stamps `missing_since` for files
-- that disappeared, so SGPC's churn is queryable rather than silently applied.

create table tracks (
  -- Content's natural key (tree|artist|date|slot), NOT a hash of the URL.
  -- SGPC has reorganised this archive once already; a URL-keyed id would
  -- orphan every rendition attached to it the next time a file moves.
  id             text primary key,
  tree           source_tree not null,
  url            text not null,

  -- The directory is the artist of record. Filenames are misspelt often
  -- enough ("Agaykar" for "Agyakar") that disagreement is noise, not signal —
  -- it is recorded below but never gates anything.
  artist_dir     text,
  artist_in_file text,

  date           date,
  slot_start_sec int,
  slot_end_sec   int,
  slot_end_open  boolean not null default false,

  -- Puratan only: the title IS the shabad's first line, which is what makes
  -- that tier auto-matchable against BaniDB with no human in the loop.
  title          text,

  size_bytes     bigint,
  modified_at    timestamptz,

  raw_filename   text not null,
  confidence     text not null default 'high',
  flags          text[] not null default '{}',

  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  missing_since  timestamptz
);

create index tracks_tree_idx    on tracks (tree);
create index tracks_artist_idx  on tracks (artist_dir);
create index tracks_date_idx    on tracks (date desc nulls last);
create index tracks_live_idx    on tracks (tree, date desc) where missing_since is null;
-- Search is the product's primary action, so both text columns get trigram
-- indexes rather than relying on LIKE scans over 49k rows.
create index tracks_artist_trgm on tracks using gin (artist_dir extensions.gin_trgm_ops);
create index tracks_title_trgm  on tracks using gin (title extensions.gin_trgm_ops);

-- ── profiles ──────────────────────────────────────────────────────────────
-- One row per account, created by the handle_new_user() trigger. Holds the
-- trust ladder; `trust` is writable only through set_trust() — see the
-- column-level grant in the authz migration for why that matters.

create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  trust        trust_level not null default 'contributor',
  -- Free-form so new workbench modes don't need a migration.
  tasks        text[] not null default '{}',
  created_at   timestamptz not null default now()
);

-- ── artists ───────────────────────────────────────────────────────────────
-- Artists as first-class rows, so a photo, biography, or corrected spelling
-- has somewhere to live. The directory name stays the join key so nothing has
-- to be re-crawled.

create table artists (
  -- The directory name exactly as it appears on sgpc.net. Not a surrogate id:
  -- it is what every track already carries, so the join needs no backfill.
  name         text primary key,
  -- Optional corrected/preferred spelling shown in place of `name`.
  display_name text,
  bio          text,
  -- Supabase Storage path. Null is the normal case — the player falls back to
  -- a generated gradient, which is why the archive looks designed rather than
  -- broken with zero photos uploaded.
  photo_path   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── renditions ────────────────────────────────────────────────────────────
-- A tagged region of a track — the unit the player actually searches and
-- plays. Costs one row: Range requests do the seeking, so nothing is
-- re-encoded, downloaded, or stored.

create table renditions (
  id          uuid primary key default gen_random_uuid(),
  track_id    text not null
                constraint renditions_track_id_fkey
                references tracks on delete cascade,

  -- Boundaries in absolute seconds into the track file.
  start_sec   numeric(10,2) not null
                constraint renditions_start_sec_check check (start_sec >= 0),
  end_sec     numeric(10,2) not null,

  -- The only required tag. Typing what you hear needs no Gurbani literacy,
  -- which is what keeps the highest-volume task open to any contributor.
  name        text not null,

  -- Optional and additive. Once set, raag / ang / author / lyrics all come
  -- from BaniDB for free — which is why this is the tag worth investing in.
  shabad_id   int,
  raag        text,
  taal        text,
  instrument  text,

  -- The public app reads `published` only, so partial work never leaks.
  status      rendition_status not null default 'draft',
  -- Machine-proposed rows need review; also makes every tag usable later as
  -- training data with its provenance intact.
  source      text not null default 'manual',

  created_by  uuid
                constraint renditions_created_by_fkey
                references profiles on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  play_count  bigint not null default 0,

  -- Optional artist override; the shabads view coalesces to the track's
  -- directory. A set can feature a second ragi partway through, and future
  -- sources may have no directory at all.
  artist      text,
  -- Where this rendition came from, so a non-SGPC source is a value rather
  -- than a schema change.
  source_ref  text,

  -- People recognise a kirtan rendition by its rahao (the refrain the ragi
  -- returns to), not by the shabad's first line.
  main_verse_id bigint,

  -- Per-line singing times from audio alignment. Three decisions worth not
  -- re-deriving:
  --   1. Times are ABSOLUTE seconds into the track file — the same clock as
  --      start_sec/end_sec and the <audio> element. Renditions get re-cut as
  --      tagging improves and the audio does not move when they do, so
  --      absolute times survive a boundary edit; relative ones would shift.
  --   2. Keyed on BaniDB verse_id, not the line's index within the shabad —
  --      an index is one BaniDB revision away from the wrong line.
  --   3. JSONB rather than a child table: always read whole when the lyrics
  --      panel opens, written as one idempotent UPDATE per aligned rendition.
  -- Coverage is deliberately SPARSE: gaps mean nothing is being sung (alaap,
  -- instrumental passages, katha) and the panel must show no highlight there.
  line_timings jsonb,

  constraint rendition_ordered check (end_sec > start_sec)
);

create index renditions_track_idx     on renditions (track_id);
create index renditions_shabad_idx    on renditions (shabad_id) where shabad_id is not null;
create index renditions_published_idx on renditions (status) where status = 'published';
create index renditions_name_trgm     on renditions using gin (name extensions.gin_trgm_ops);
create index renditions_popular_idx   on renditions (play_count desc) where status = 'published';
create index renditions_artist_idx    on renditions (artist) where artist is not null;

comment on column renditions.main_verse_id is
  'BaniDB verseId of the line this rendition is anchored to (rahao/sthayi). Nullable.';

comment on column renditions.line_timings is
  'Per-line singing times from audio alignment: [{verse_id, start, end}], '
  'sorted by start. Times are absolute seconds into the track, matching '
  'start_sec/end_sec. Sparse — gaps mean nothing is being sung. Null until '
  'the rendition has been aligned. See issue #30.';

-- ── role_permissions ──────────────────────────────────────────────────────
-- Role permissions as data, not as conditions baked into policies. An enum of
-- capabilities, a table mapping role to capability, and one authorize()
-- function every policy defers to (same shape np-mono uses). The security
-- boundary does not move — it is still enforced in Postgres — but toggling a
-- capability is an admin action rather than a deploy. Defaults are seeded in
-- the authz migration.

create table role_permissions (
  id         bigint generated by default as identity primary key,
  role       trust_level not null,
  permission app_permission not null,
  unique (role, permission)
);

-- ── favorites / playlists ─────────────────────────────────────────────────
-- Optional accounts on the player. Listening still requires no login; an
-- account adds exactly two things: favorites that outlive one browser's
-- localStorage, and playlists. Both key on renditions(id) — the same id the
-- shabads view exposes and device-local favorites already use, so a guest's
-- saved list migrates into their account as a straight insert.

create table favorites (
  -- References `profiles` rather than `auth.users` directly, matching
  -- `renditions.created_by`. The cascade still reaches: `profiles.id` itself
  -- cascades from `auth.users`.
  user_id      uuid not null references profiles on delete cascade,
  rendition_id uuid not null references renditions on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, rendition_id)
);

-- The only read is "this user's favorites, newest first".
create index favorites_user_idx on favorites (user_id, created_at desc);

create table playlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles on delete cascade,
  -- Bounded and trimmed in the database, not just in the form: a blank or
  -- whitespace-only name renders as an unclickable gap in the list.
  name       text not null check (length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create index playlists_user_idx on playlists (user_id, created_at desc);

create table playlist_items (
  playlist_id  uuid not null references playlists on delete cascade,
  rendition_id uuid not null references renditions on delete cascade,
  -- Append order, assigned by the set_playlist_item_position() trigger so the
  -- client never computes it. An int rather than a numeric because nothing
  -- reorders yet.
  position     int not null default 0,
  added_at     timestamptz not null default now(),
  -- A rendition appears in a playlist once. Adding it again is a no-op, not a
  -- duplicate row the listener then has to delete twice.
  primary key (playlist_id, rendition_id)
);

create index playlist_items_order_idx on playlist_items (playlist_id, position);

-- ── scan_requests ─────────────────────────────────────────────────────────
-- The scan queue: which recordings a human wants shabad suggestions for.
--
-- Scanning is the one batch job that cannot be data-driven the way alignment
-- is (alignment's queue is fully determined by state: published + shabad_id +
-- line_timings null). Scanning the whole archive would be ~1,000 CPU-hours of
-- suggestions nobody is about to review — so a human picks which recording
-- deserves suggestions next, and this table is that choice. The button in
-- admin inserts here; the out-of-band scanner
-- (packages/aligner/scan_track.py --from-queue) consumes it on its next run.
--
-- A row is a request, not a promise: `done_at` is set when the scanner has
-- processed the track, whether or not it found anything confident enough to
-- draft. Completed rows are kept (not deleted) so the button can show
-- "already suggested" — and `done` is not terminal: re-requesting is an
-- UPDATE that clears done_at, because the matcher improves and yesterday's
-- nothing is next month's suggestion.

create table scan_requests (
  track_id     text primary key references tracks (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  done_at      timestamptz,
  -- What the scanner saw but refused to say. The scan gates are
  -- precision-first — a 0.60/+0.03 region is not confident enough to draft,
  -- because a wrong draft is wrong sacred text. But refusing to DRAFT should
  -- not mean refusing to TELL: these are the pointers a tagger needs
  -- ("possible: shabad 294 around 12:00, conf 0.60") to jump there and
  -- confirm by ear — the human does the asserting, the machine only points.
  findings     jsonb
);

comment on column scan_requests.findings is
  'Regions the scan saw but refused to draft (below the confidence/margin '
  'gates): [{shabad_id, name, start, end, confidence, margin}], track-clock '
  'seconds. Shown in the tagger as listen-here pointers. Replaced on re-scan.';
