-- Kirtan archive — initial schema.
--
-- Two tables carry the product: `tracks` mirrors what exists on sgpc.net, and
-- `segments` is the tagged layer we own. Everything else supports those two.

create extension if not exists pg_trgm;

-- ── tracks ────────────────────────────────────────────────────────────────
-- One row per audio file on sgpc.net. Refreshed by a nightly full re-crawl
-- (~670 requests) which upserts on `id` and stamps `missing_since` for files
-- that disappeared, so SGPC's churn is queryable rather than silently applied.

create type source_tree as enum ('ragiwise', 'puratan', 'daywise');

create table tracks (
  -- Content's natural key (tree|artist|date|slot), NOT a hash of the URL.
  -- SGPC has reorganised this archive once already; a URL-keyed id would
  -- orphan every segment attached to it the next time a file moves.
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
create index tracks_artist_trgm on tracks using gin (artist_dir gin_trgm_ops);
create index tracks_title_trgm  on tracks using gin (title gin_trgm_ops);

-- ── profiles ──────────────────────────────────────────────────────────────
-- Trust is a single earned ladder; task preference is a separate multi-select
-- that routes work and grants nothing. Conflating them is what made an
-- earlier five-role design heavy for no benefit.

create type trust_level as enum ('contributor', 'trusted', 'reviewer', 'admin');

create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  trust        trust_level not null default 'contributor',
  -- Free-form so new workbench modes don't need a migration.
  tasks        text[] not null default '{}',
  created_at   timestamptz not null default now()
);

-- Every account gets a profile; `contributor` means "can propose, can't publish".
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── segments ──────────────────────────────────────────────────────────────
-- A tagged region of a track — the unit the player actually searches and
-- plays. Costs one row: Range requests do the seeking, so nothing is
-- re-encoded, downloaded, or stored.

create type segment_status as enum (
  'draft', 'segmented', 'shabad_linked', 'music_tagged', 'reviewed', 'published'
);

create table segments (
  id          uuid primary key default gen_random_uuid(),
  track_id    text not null references tracks on delete cascade,

  start_sec   numeric(10,2) not null check (start_sec >= 0),
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
  status      segment_status not null default 'draft',
  -- Machine-proposed rows need review; also makes every tag usable later as
  -- training data with its provenance intact.
  source      text not null default 'manual',

  created_by  uuid references profiles on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint segment_ordered check (end_sec > start_sec)
);

create index segments_track_idx     on segments (track_id);
create index segments_shabad_idx    on segments (shabad_id) where shabad_id is not null;
create index segments_published_idx on segments (status) where status = 'published';
create index segments_name_trgm     on segments using gin (name gin_trgm_ops);

-- ── row level security ────────────────────────────────────────────────────

alter table tracks   enable row level security;
alter table segments enable row level security;
alter table profiles enable row level security;

-- The catalogue is public and read-only; only the crawler (service role,
-- which bypasses RLS) writes it.
create policy "tracks are public"
  on tracks for select using (true);

-- Anyone may read published segments without an account — listening never
-- requires login. Contributors additionally see their own unpublished work.
create policy "published segments are public"
  on segments for select
  using (status = 'published' or created_by = (select auth.uid()));

-- Anyone signed in may propose. Nothing here can publish: `status` is checked
-- on write, and the review path runs as a privileged role.
create policy "signed-in users may propose segments"
  on segments for insert to authenticated
  with check (created_by = (select auth.uid()) and status <> 'published');

create policy "authors may edit their unpublished segments"
  on segments for update to authenticated
  using (created_by = (select auth.uid()) and status <> 'published')
  with check (created_by = (select auth.uid()) and status <> 'published');

create policy "profiles are public"
  on profiles for select using (true);

create policy "users may edit their own profile"
  on profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
