-- Deleting a scan draft is a rejection, and it is written down.
--
-- A wrong scan draft is deleted, and that lost two things. The auto-publish
-- trial (#82) needs every draft's fate — published as drafted, edges moved,
-- re-tagged, turned down — and a deleted draft left nothing to count. And
-- Scan again suggested the same wrong shabad straight back: the scanner skips
-- a shabad already on the recording, and a deleted one no longer was.
--
-- So a person deleting a scan draft leaves a row here: which shabad the
-- scanner drafted, where, what it said about it, and who turned it down. The
-- scanner reads it and never suggests that shabad on the recording again; the
-- trial's report reads it next to the scan drafts still standing. Nothing
-- else changes: renditions keeps only live rows, so no list or count has to
-- filter anything out.

create table scan_rejections (
  -- The deleted rendition's id: one rejection per draft, and the report can
  -- list these beside the live drafts under one id type.
  id           uuid primary key,
  track_id     text not null references tracks (id) on delete cascade,
  -- The shabad the scanner drafted, not whatever a tagger had re-linked it to.
  shabad_id    int,
  start_sec    numeric(10,2) not null,
  end_sec      numeric(10,2) not null,
  -- What it was when deleted: 'published' means it reached the player first.
  status       rendition_status not null,
  scan_verdict jsonb,
  drafted_at   timestamptz not null,
  rejected_at  timestamptz not null default now(),
  rejected_by  uuid references profiles (id) on delete set null
);

create index scan_rejections_track_idx on scan_rejections (track_id);

-- Written only by the trigger below and read only by the scanner and the owner:
-- no API role may touch it, so a rejection can be neither forged nor undone
-- through the app. Restoring one is a delete in the SQL editor.
alter table scan_rejections enable row level security;
revoke all on scan_rejections from anon, authenticated;
grant select on scan_rejections to service_role;

-- A person deleting a scan draft through the app, not a cascade from a
-- track or a cleanup in the SQL editor: auth.uid() is null for both.
create function private.record_scan_rejection() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  sid int := coalesce((old.scan_verdict ->> 'shabad_id')::int, old.shabad_id);
begin
  if auth.uid() is null then
    return old;
  end if;
  insert into public.scan_rejections
    (id, track_id, shabad_id, start_sec, end_sec, status, scan_verdict,
     drafted_at, rejected_by)
  values
    (old.id, old.track_id, sid, old.start_sec, old.end_sec, old.status,
     old.scan_verdict, old.created_at, auth.uid())
  on conflict (id) do nothing;
  -- And the listen-here pointers the same scan left for that shabad. The next
  -- scan drops them too, but nobody presses Scan again once the drafts are
  -- dealt with, and the tag page would go on offering it. findings only:
  -- done_at stays, so this starts no scan.
  update public.scan_requests
  set findings = (
    select jsonb_agg(f)
    from jsonb_array_elements(findings) f
    where (f ->> 'shabad_id')::int is distinct from sid
  )
  where track_id = old.track_id
    and findings @> jsonb_build_array(jsonb_build_object('shabad_id', sid));
  return old;
end;
$$;

revoke all on function private.record_scan_rejection() from public, anon, authenticated;

create trigger renditions_record_scan_rejection
  after delete on renditions
  for each row when (old.source = 'scan')
  execute function private.record_scan_rejection();

-- Drafts written before the scanner put the drafted shabad in its verdict:
-- nobody has edited these, so the row's own shabad is still the one drafted.
update renditions
set scan_verdict = scan_verdict || jsonb_build_object('shabad_id', shabad_id)
where source = 'scan'
  and scan_verdict is not null
  and not scan_verdict ? 'shabad_id'
  and updated_at = created_at;

-- The trial's report: every scan draft with a verdict, standing or turned
-- down, and what people did with it. The summary query is in
-- packages/aligner/README.md.
create view scan_draft_outcomes as
select
  d.id,
  d.track_id,
  d.drafted_at,
  (d.v ->> 'auto')::boolean as auto,
  (d.v ->> 'confidence')::numeric as confidence,
  (d.v ->> 'margin')::numeric as margin,
  (d.v ->> 'align_confidence')::numeric as align_confidence,
  c.drafted_shabad,
  d.shabad_id,
  c.start_moved_sec,
  c.end_moved_sec,
  case
    when d.rejected and d.status = 'published' then 'deleted after publishing'
    when d.rejected then 'rejected'
    -- The scanner writes shabad_linked or published; 'draft' is an Unpublish.
    when d.status = 'draft' then 'unpublished'
    when d.status <> 'published' then 'waiting'
    -- Drafted before the scanner recorded its shabad, and edited before the
    -- backfill above could vouch for it: whether it was re-tagged is lost.
    when c.drafted_shabad is null then 'published, shabad unknown'
    when d.shabad_id is distinct from c.drafted_shabad then 're-tagged'
    -- Any change: the scanner writes the row's edges and the verdict's the same
    -- way, so a difference is a person's edit — one nudge is exactly a second.
    when c.start_moved_sec > 0 or c.end_moved_sec > 0 then 'edges moved'
    -- Nobody reviewed it: AUTO_PUBLISH was on and it was an auto draft.
    when (d.v ->> 'published')::boolean then 'published by the scanner'
    else 'published as drafted'
  end as outcome
from (
  select r.id, r.track_id, r.created_at as drafted_at, r.scan_verdict as v,
         r.status, r.start_sec, r.end_sec, r.shabad_id, false as rejected
  from renditions r
  where r.source = 'scan' and r.scan_verdict is not null
  union all
  select x.id, x.track_id, x.drafted_at, x.scan_verdict, x.status,
         x.start_sec, x.end_sec, x.shabad_id, true
  from scan_rejections x
  where x.scan_verdict is not null
) d
cross join lateral (
  select (d.v ->> 'shabad_id')::int as drafted_shabad,
         abs(d.start_sec - (d.v ->> 'start')::numeric) as start_moved_sec,
         abs(d.end_sec - (d.v ->> 'end')::numeric) as end_moved_sec
) c;

-- For the owner in the SQL editor, not the API: it runs as owner, past RLS,
-- and would show every contributor's drafts to anyone who could select it.
revoke all on scan_draft_outcomes from public, anon, authenticated, service_role;
grant select on scan_draft_outcomes to service_role;

comment on table scan_rejections is
  'Scan drafts a person deleted: the drafted shabad, span, status and verdict. '
  'The scanner never suggests that shabad on the recording again. Written '
  'only by the renditions delete trigger; delete a row here to restore it.';
comment on view scan_draft_outcomes is
  'Auto-publish trial report: every scan draft with a verdict, live or '
  'rejected, and its outcome. Owner-only. Summary query: '
  'packages/aligner/README.md.';
