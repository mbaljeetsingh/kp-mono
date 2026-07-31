-- Artists as first-class rows.
--
-- Until now an "artist" was just a directory name repeated across 41k track
-- rows. That is enough to browse by, but nothing can be *attached* to it —
-- no photo, no biography, no correction of SGPC's spelling. This gives each
-- one a row to hang that off, while the directory name stays the join key so
-- nothing has to be re-crawled.

create table artists (
  -- The directory name exactly as it appears on sgpc.net. Not a surrogate id:
  -- it is what every track already carries, so the join needs no backfill.
  name        text primary key,
  -- Optional corrected/preferred spelling shown in place of `name`.
  display_name text,
  bio         text,
  -- Supabase Storage path. Null is the normal case — the player falls back to
  -- a generated gradient, which is why the archive looks designed rather than
  -- broken with zero photos uploaded.
  photo_path  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table artists enable row level security;

create policy "artists are public" on artists for select using (true);
create policy "reviewers may edit artists"
  on artists for all to authenticated
  using (is_reviewer()) with check (is_reviewer());

grant select on artists to anon, authenticated;
grant all on artists to authenticated, service_role;

-- Seed from what the crawl already knows, so every artist has a row to edit
-- immediately rather than being created on first upload.
insert into artists (name)
select distinct artist_dir from tracks
where artist_dir is not null
on conflict (name) do nothing;

-- Expose the photo alongside each shabad so the player needs one query, not two.
drop view if exists shabads;
create view shabads as
select
  s.id, s.name, s.start_sec, s.end_sec,
  s.end_sec - s.start_sec as duration_sec,
  s.shabad_id, s.raag, s.taal, s.instrument, s.created_at,
  t.id as track_id, t.url, t.tree,
  t.artist_dir as artist,
  coalesce(a.display_name, t.artist_dir) as artist_display,
  a.photo_path as artist_photo,
  t.date
from segments s
join tracks t on t.id = s.track_id
left join artists a on a.name = t.artist_dir
where s.status = 'published' and t.missing_since is null;

grant select on shabads to anon, authenticated;
