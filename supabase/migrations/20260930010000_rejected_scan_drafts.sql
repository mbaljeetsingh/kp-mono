-- Rejecting a scan draft keeps it.
--
-- A reviewer turned a wrong scan draft down by deleting it, and that lost two
-- things. The auto-publish trial (#82) needs every draft's fate — published as
-- drafted, edges moved, re-tagged, rejected — and a deleted draft leaves
-- nothing to count. And Scan again suggested the same wrong shabad straight
-- back: the scanner skips a shabad already on the recording, and a deleted one
-- no longer was.
--
-- So a rejection is a timestamp, not a delete. The row stays, naming its
-- shabad — which is all the scanner's skip needs — and counts for nothing
-- else: the admin leaves it out of the tagger's list and Review, the queue's
-- counts and coverage leave it out (the view below), and it can never be
-- published (the check). Only scan drafts are turned down this way; a
-- person's draft is still deleted, and still asks first.

alter table renditions
  add column rejected_at timestamptz,
  add column rejected_by uuid references auth.users (id) on delete set null,
  add constraint renditions_rejected_not_published
    check (rejected_at is null or status <> 'published');

comment on column renditions.rejected_at is
  'When a person turned this scan draft down. Kept, not deleted: the '
  'auto-publish trial counts rejections (scan_draft_outcomes), and the '
  'scanner never suggests a shabad already on the recording. Hidden from '
  'every list and count; never published.';

-- The queue leaves rejected drafts out of its counts, coverage and recency: a
-- recording whose every suggestion was turned down has nothing tagged, and
-- belongs back on Not started. Otherwise unchanged from
-- 20260901000400_recordings_recent_activity.sql — the same columns, still
-- running as owner ON PURPOSE (see 20260804000200_views.sql).
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
cross join lateral (
  select case
    when t.slot_start_sec is not null and t.slot_end_sec > t.slot_start_sec
      then t.slot_end_sec - t.slot_start_sec
  end as seconds
) est
left join artists a on a.name = t.artist_dir
left join (
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
    where rejected_at is null
  ) spans
  group by track_id
) rc on rc.track_id = t.id
where t.tree <> 'daywise'
  and t.missing_since is null
  and not (t.flags @> array['unplayable-format']);

-- The trial's report: every scan draft, what the scanner said about it, and
-- what people did with it. In the SQL editor, for example:
--
--   select auto, outcome, count(*) as drafts,
--          round(avg(start_moved_sec + end_moved_sec)
--                filter (where outcome = 'edges moved'), 1) as avg_moved_sec
--   from scan_draft_outcomes group by auto, outcome order by auto desc, outcome;
--
-- auto = the draft cleared every auto-publish gate; the question the trial
-- answers is how often those end anywhere but 'published as drafted'. Edges
-- count as moved past a second — a tagger's nudge is a tenth of one. A draft
-- written before this migration carries no drafted_shabad, so a re-tag of one
-- reads as published; and drafts deleted before it are gone for good.
create view scan_draft_outcomes as
select
  r.id,
  r.track_id,
  r.created_at,
  (r.scan_verdict ->> 'auto')::boolean as auto,
  (r.scan_verdict ->> 'confidence')::numeric as confidence,
  (r.scan_verdict ->> 'margin')::numeric as margin,
  (r.scan_verdict ->> 'align_confidence')::numeric as align_confidence,
  (r.scan_verdict ->> 'shabad_id')::int as drafted_shabad,
  r.shabad_id,
  abs(r.start_sec - (r.scan_verdict ->> 'start')::numeric) as start_moved_sec,
  abs(r.end_sec - (r.scan_verdict ->> 'end')::numeric) as end_moved_sec,
  case
    when r.rejected_at is not null then 'rejected'
    when r.status <> 'published' then 'waiting'
    when r.shabad_id is distinct from (r.scan_verdict ->> 'shabad_id')::int
         and r.scan_verdict ? 'shabad_id' then 're-tagged'
    when abs(r.start_sec - (r.scan_verdict ->> 'start')::numeric) > 1
         or abs(r.end_sec - (r.scan_verdict ->> 'end')::numeric) > 1 then 'edges moved'
    else 'published as drafted'
  end as outcome
from renditions r
where r.source = 'scan' and r.scan_verdict is not null;

-- For the owner in the SQL editor, not the API: it runs as owner, past RLS, so
-- it would show every contributor's drafts to anyone who could select it.
-- Revoke-then-grant, as authz.sql does; the service key may read it for a
-- script, since it bypasses RLS anyway.
revoke all on scan_draft_outcomes from public, anon, authenticated, service_role;
grant select on scan_draft_outcomes to service_role;

comment on view scan_draft_outcomes is
  'Auto-publish trial report: every scan draft with its scan_verdict and its '
  'fate — waiting, rejected, re-tagged, edges moved, published as drafted. '
  'Owner-only (no API grant). See its migration for a summary query.';
