-- What to tag next.
--
-- 42k files is too many to face as a flat list, and they are not equally worth
-- a contributor's time. Shorter recordings finish in one sitting, which is what
-- keeps a volunteer coming back; a 90-minute set abandoned halfway leaves a
-- half-tagged file nobody else wants to pick up. Files already carrying
-- segments rank below untouched ones so effort spreads instead of piling up.
create view tag_queue as
select
  t.id,
  t.url,
  t.tree,
  t.artist_dir,
  t.date,
  t.raw_filename,
  t.title,
  t.slot_start_sec,
  t.slot_end_sec,
  -- Nominal length straight from the filename slot ("12.00pm to 1.10pm").
  -- Null for puratan, which carries no slot — those sort last rather than
  -- first, since an unknown length is a worse bet than a known short one.
  case
    when t.slot_start_sec is not null and t.slot_end_sec > t.slot_start_sec
      then t.slot_end_sec - t.slot_start_sec
  end as est_seconds,
  coalesce(sc.segments, 0) as segments,
  coalesce(sc.published, 0) as published
from tracks t
left join (
  select track_id,
         count(*) as segments,
         count(*) filter (where status = 'published') as published
  from segments group by track_id
) sc on sc.track_id = t.id
-- Day files are 563MB and ~20 hours; nobody should be handed one to scrub.
where t.tree <> 'daywise'
  and t.missing_since is null
  and not (t.flags @> array['unplayable-format']);

grant select on tag_queue to authenticated;
