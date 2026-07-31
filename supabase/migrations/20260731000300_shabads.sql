-- The player's only read surface.
--
-- The catalogue is 49k audio *files*; the product is shabads. A file is a
-- 70-minute set or a 37-minute archival performance containing many shabads,
-- so nothing is listenable as a "track" until someone marks where each shabad
-- starts and ends. This view exposes exactly that — published segments, joined
-- to the file they point into.
--
-- Everything the player renders comes from here, which means untagged and
-- part-tagged material simply isn't visible, rather than being surfaced as
-- unusable hour-long blobs.
create or replace view shabads as
select
  s.id,
  s.name,
  s.start_sec,
  s.end_sec,
  s.end_sec - s.start_sec as duration_sec,
  s.shabad_id,
  s.raag,
  s.taal,
  s.instrument,
  s.created_at,
  t.id      as track_id,
  t.url,
  t.tree,
  -- The directory is the artist of record; filenames are misspelt too often
  -- to be trusted, and the admin corrects genuine misfilings.
  t.artist_dir as artist,
  t.date
from segments s
join tracks t on t.id = s.track_id
where s.status = 'published'
  and t.missing_since is null;

-- Artists, counted by published shabads rather than by files — an artist with
-- 800 untagged recordings and no segments has nothing to show yet.
drop function if exists artist_counts();
create function artist_counts()
returns table (artist_dir text, shabads bigint)
language sql stable as $$
  select sh.artist, count(*) as shabads
  from shabads sh
  where sh.artist is not null
  group by sh.artist
  order by count(*) desc, sh.artist;
$$;

grant select on shabads to anon, authenticated;
grant execute on function artist_counts() to anon, authenticated;
