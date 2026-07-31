-- Let a segment carry its own artist.
--
-- Today an artist is inferred from the SGPC directory the file sits in, which
-- works only because every file here comes from one source and one performer.
-- Neither stays true: a set can feature a second ragi partway through, and
-- shabads will eventually come from sources that have no directory at all.
--
-- So the segment gets an optional override and the view coalesces — nothing
-- has to be backfilled, and the inferred value keeps working until someone
-- corrects it.

alter table segments
  add column artist text,
  -- Where this shabad came from, so a future non-SGPC source is a value rather
  -- than a schema change.
  add column source_ref text;

create index segments_artist_idx on segments (artist) where artist is not null;

drop view if exists shabads;
create view shabads as
select
  s.id, s.name, s.start_sec, s.end_sec,
  s.end_sec - s.start_sec as duration_sec,
  s.shabad_id, s.raag, s.taal, s.instrument, s.play_count,
  s.source_ref, s.created_at,
  t.id as track_id, t.url, t.tree,
  -- The segment's own artist wins; the file's directory is the fallback.
  coalesce(s.artist, t.artist_dir) as artist,
  coalesce(a.display_name, s.artist, t.artist_dir) as artist_display,
  a.photo_path as artist_photo,
  t.date
from segments s
join tracks t on t.id = s.track_id
left join artists a on a.name = coalesce(s.artist, t.artist_dir)
where s.status = 'published' and t.missing_since is null;

drop function if exists artist_counts();
create function artist_counts()
returns table (artist_dir text, shabads bigint)
language sql stable as $$
  select sh.artist, count(*) from shabads sh
  where sh.artist is not null
  group by sh.artist order by count(*) desc, sh.artist;
$$;

grant select on shabads to anon, authenticated;
grant execute on function artist_counts() to anon, authenticated;
