-- Expose the photo alongside the artist listing.
--
-- The photos were uploaded and linked but nothing could reach them: the
-- browse page reads artist_counts(), which returned only a name and a count,
-- and the artist page had no artist row at all — just a name from the URL.

drop function if exists artist_counts();
create function artist_counts()
returns table (artist_dir text, shabads bigint, photo_path text)
language sql stable as $$
  select sh.artist, count(*), max(a.photo_path)
  from shabads sh
  left join artists a on a.name = sh.artist
  where sh.artist is not null
  group by sh.artist
  order by count(*) desc, sh.artist;
$$;

grant execute on function artist_counts() to anon, authenticated;

-- Every artist, whether or not they have a published rendition yet. The browse
-- page should not go blank just because tagging has not reached someone.
create or replace function artist_directory()
returns table (name text, display_name text, photo_path text, shabads bigint)
language sql stable as $$
  select
    a.name,
    coalesce(a.display_name, a.name),
    a.photo_path,
    count(sh.id)
  from artists a
  left join shabads sh on sh.artist = a.name
  group by a.name, a.display_name, a.photo_path
  order by count(sh.id) desc, a.name;
$$;

grant execute on function artist_directory() to anon, authenticated;
