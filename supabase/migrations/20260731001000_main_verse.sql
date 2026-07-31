-- The line a shabad is actually known by.
--
-- A BaniDB `shabadId` identifies the whole shabad, but people recognise a
-- kirtan rendition by its rahao (the refrain the ragi returns to), not by the
-- shabad's first line. Storing that verse alongside the shabad id lets the
-- player show what a listener would actually recognise, and matches how
-- np-mono anchors a notation.
alter table segments add column main_verse_id bigint;

comment on column segments.main_verse_id is
  'BaniDB verseId of the line this rendition is anchored to (rahao/sthayi). Nullable.';

drop view if exists shabads;
create view shabads as
select
  s.id, s.name, s.start_sec, s.end_sec,
  s.end_sec - s.start_sec as duration_sec,
  s.shabad_id, s.main_verse_id, s.raag, s.taal, s.instrument, s.play_count,
  s.source_ref, s.created_at,
  t.id as track_id, t.url, t.tree,
  coalesce(s.artist, t.artist_dir) as artist,
  coalesce(a.display_name, s.artist, t.artist_dir) as artist_display,
  a.photo_path as artist_photo,
  t.date
from segments s
join tracks t on t.id = s.track_id
left join artists a on a.name = coalesce(s.artist, t.artist_dir)
where s.status = 'published' and t.missing_since is null;

grant select on shabads to anon, authenticated;
