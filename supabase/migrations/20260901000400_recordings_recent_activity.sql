-- The recordings list learns what was touched most recently.
--
-- The shelves answer "what is there to do?"; they could not answer "what was
-- I just doing?" — a tagger returning after lunch had to remember which
-- recording they were in the middle of, because every ordering the list
-- offered (slot length, rendition count) is static. `last_activity_at` is
-- the newest trace of tagging work on the recording: the latest rendition
-- CREATED or the done-mark, whichever is later.
--
-- created_at, deliberately not updated_at. updated_at is a housekeeping
-- timestamp bumped by renditions_touch_updated_at on any real change — and
-- two of its writers are machines: register_play increments play_count on
-- every anonymous listen (published rows only, so public traffic would
-- permanently churn exactly the shelves where recency is the point), and the
-- aligner PATCHes line_timings. created_at is immutable and only humans
-- insert renditions, so the ordering is stable under load and means what it
-- says. The cost is that later edits and publish flips don't re-surface a
-- recording; the tagging loop is insert-driven, so that is the cheaper half
-- to lose. GREATEST ignores NULLs, so a track with renditions and no
-- done-mark — or the reverse — still gets the one timestamp it has; NULL
-- means genuinely untouched, and the app sorts those last.
--
-- Replaced, not altered, and the new column is appended: CREATE OR REPLACE
-- VIEW only permits adding columns at the end. The view keeps running as
-- owner ON PURPOSE — see 20260804000200_views.sql for the full argument; do
-- not add security_invoker.

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
  greatest(rc.last_tagged_at, t.tagged_done_at) as last_activity_at
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
         max(created_at) as last_tagged_at
  from (
    select track_id, start_sec, end_sec, status, created_at,
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

comment on view recordings is
  'Tagging queue. Runs as owner ON PURPOSE: the renditions/published counts '
  'must include other contributors'' unpublished drafts or the todo filter '
  'stops preventing duplicated work. Do not add security_invoker — see '
  '20260804000200_views.sql. Bounded by the grant: anon has no SELECT, and '
  'every signed-in account is a contributor by design. untagged_seconds is '
  'estimate-based (slot length vs merged coverage) — filter with slack, '
  'never on zero — and NULL when the length is unknowable (no slot); '
  'tagged_done_at is a tagger''s assertion that the rest is not shabads; '
  'last_activity_at is the newest tagging trace (rendition created or '
  'done-mark — created_at on purpose, updated_at is bumped by plays and the '
  'aligner), NULL when untouched.';
