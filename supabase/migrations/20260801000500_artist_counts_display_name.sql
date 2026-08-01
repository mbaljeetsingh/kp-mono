-- Home shows the corrected spelling too.
--
-- artist_directory() has returned display_name since photos landed, but the
-- home grid reads artist_counts(), which never did — so correcting a ragi's
-- name showed on /ragis and nowhere else. Dropped rather than replaced
-- because the return type changes.
drop function if exists artist_counts();
create function artist_counts()
returns table (
  artist_dir text,
  shabads bigint,
  photo_path text,
  display_name text
)
language sql stable as $$
  select
    sh.artist,
    count(*),
    max(a.photo_path),
    -- a.name is the primary key, so at most one row joins per group and max()
    -- is just "the value" rather than a choice between candidates.
    max(a.display_name)
  from shabads sh
  left join artists a on a.name = sh.artist
  where sh.artist is not null
  group by sh.artist
  order by count(*) desc, sh.artist;
$$;

grant execute on function artist_counts() to anon, authenticated;
