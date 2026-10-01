-- The queue's Suggested shelf (#41, #74 S1): recordings with scan drafts
-- waiting for someone. The nightly scan now drafts recordings nobody asked
-- for, and without a shelf the only way to find which ones got drafts was to
-- open them, or read Review a rendition at a time.
--
-- One column more on the view the shelves already filter, counted where the
-- others are: scan drafts not yet published, the same rows Review lists. At
-- the end of the column list, as create or replace needs, so the grants and
-- the comment stay.

create or replace view recordings as
select
  t.id, t.url, t.tree, t.artist_dir, t.date, t.raw_filename, t.title,
  t.slot_start_sec, t.slot_end_sec,
  a.photo_path as artist_photo,
  est.seconds as est_seconds,
  coalesce(rc.renditions, 0) as renditions,
  coalesce(rc.published, 0) as published,
  case
    when est.seconds is not null then greatest(
      round(
        greatest(est.seconds, coalesce(rc.max_end_sec, 0))
          - coalesce(rc.tagged_seconds, 0)
      )::int,
      0
    )
  end as untagged_seconds,
  t.tagged_done_at,
  greatest(rc.last_tagged_at, t.tagged_done_at) as last_activity_at,
  coalesce(rc.scan_drafts, 0) as scan_drafts
from tracks t
-- Nominal length straight from the filename slot; null for puratan, which
-- carries no slot. Computed once here so the est_seconds column and the
-- untagged_seconds arithmetic cannot drift apart.
cross join lateral (
  select case
    when t.slot_start_sec is not null and t.slot_end_sec > t.slot_start_sec
      then t.slot_end_sec - t.slot_start_sec
  end as seconds
) est
left join artists a on a.name = t.artist_dir
left join (
  -- Union length per track: each span contributes only what reaches past the
  -- furthest end seen so far, so overlaps count once. Every status counts as
  -- coverage — a draft still occupies its minutes.
  select track_id,
         count(*) as renditions,
         count(*) filter (where status = 'published') as published,
         sum(greatest(end_sec - greatest(start_sec, coalesce(prev_end, 0)), 0))
           as tagged_seconds,
         max(end_sec) as max_end_sec,
         max(created_at) as last_tagged_at,
         count(*) filter (where source = 'scan' and status <> 'published')
           as scan_drafts
  from (
    select track_id, start_sec, end_sec, status, source, created_at,
           max(end_sec) over (
             partition by track_id
             order by start_sec, end_sec
             rows between unbounded preceding and 1 preceding
           ) as prev_end
    from renditions
  ) spans
  group by track_id
) rc on rc.track_id = t.id
where t.tree <> 'daywise'
  and t.missing_since is null
  and not (t.flags @> array['unplayable-format']);
