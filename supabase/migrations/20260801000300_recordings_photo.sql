-- Artist photo on the admin recordings list. A wall of filenames is hard to
-- scan; a face is the fastest way to recognise whose set you are opening.
drop view if exists recordings;
create view recordings as
select
  t.id, t.url, t.tree, t.artist_dir, t.date, t.raw_filename, t.title,
  t.slot_start_sec, t.slot_end_sec,
  a.photo_path as artist_photo,
  case
    when t.slot_start_sec is not null and t.slot_end_sec > t.slot_start_sec
      then t.slot_end_sec - t.slot_start_sec
  end as est_seconds,
  coalesce(rc.renditions, 0) as renditions,
  coalesce(rc.published, 0) as published
from tracks t
left join artists a on a.name = t.artist_dir
left join (
  select track_id,
         count(*) as renditions,
         count(*) filter (where status = 'published') as published
  from renditions group by track_id
) rc on rc.track_id = t.id
where t.tree <> 'daywise'
  and t.missing_since is null
  and not (t.flags @> array['unplayable-format']);

grant select on recordings to authenticated;
