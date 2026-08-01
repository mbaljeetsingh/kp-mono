-- Browse only lists ragis you can actually listen to.
--
-- artist_directory() was written to return everyone SGPC publishes, on the
-- reasoning that a near-empty page hides the scale of the archive. In practice
-- it does the opposite: most of the 230 are still untagged, so the grid fills
-- with cards that lead to an empty page. A ragi appears once one of their
-- shabads is published, which also makes the page a visible measure of
-- tagging progress.
create or replace function artist_directory()
returns table (name text, display_name text, photo_path text, shabads bigint)
language sql stable as $$
  select
    a.name,
    coalesce(a.display_name, a.name),
    a.photo_path,
    count(sh.id)
  from artists a
  join shabads sh on sh.artist = a.name
  group by a.name, a.display_name, a.photo_path
  having count(sh.id) > 0
  order by count(sh.id) desc, a.name;
$$;

grant execute on function artist_directory() to anon, authenticated;
