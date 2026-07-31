-- Play counts, for a Popular shelf that reflects listening rather than guesswork.
--
-- Counted on the segment because a shabad is the thing people play; a file has
-- no meaning to a listener. Incremented through a security-definer function so
-- anonymous listeners can register a play without being granted UPDATE on
-- segments (which would also let them edit tags).

alter table segments add column play_count bigint not null default 0;

create index segments_popular_idx
  on segments (play_count desc) where status = 'published';

create function register_play(segment uuid) returns void
language sql volatile security definer set search_path = public as $$
  update segments set play_count = play_count + 1
  where id = segment and status = 'published';
$$;

grant execute on function register_play(uuid) to anon, authenticated;

drop view if exists shabads;
create view shabads as
select
  s.id, s.name, s.start_sec, s.end_sec,
  s.end_sec - s.start_sec as duration_sec,
  s.shabad_id, s.raag, s.taal, s.instrument, s.play_count, s.created_at,
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
