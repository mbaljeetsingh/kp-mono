-- Artist list for the player's browse page.
--
-- A view rather than a client-side group-by: 41k ragiwise rows would otherwise
-- have to cross the wire just to produce 204 counts. Day files are excluded —
-- they are indexed for later segmenting but never surfaced as browsable tracks.
create or replace function artist_counts()
returns table (artist_dir text, tracks bigint)
language sql stable as $$
  select t.artist_dir, count(*) as tracks
  from tracks t
  where t.artist_dir is not null
    and t.tree <> 'daywise'
    and t.missing_since is null
  group by t.artist_dir
  order by t.artist_dir;
$$;
