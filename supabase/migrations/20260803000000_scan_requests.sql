-- The scan queue: which recordings a human wants shabad suggestions for.
--
-- Scanning is the one batch job that cannot be data-driven the way alignment
-- is. Alignment's queue is fully determined by state (published + shabad_id +
-- line_timings null), so it needs no table and no button. Scanning the whole
-- archive would be ~1,000 CPU-hours of suggestions nobody is about to review —
-- so a human picks which recording deserves suggestions next, and this table
-- is that choice. The button in admin inserts here; the out-of-band scanner
-- (packages/aligner/scan_track.py --from-queue) consumes it on its next run.
--
-- A row is a request, not a promise: `done_at` is set when the scanner has
-- processed the track, whether or not it found anything confident enough to
-- draft. Keeping completed rows (rather than deleting) means the button can
-- show "already suggested" instead of letting the same track be requested
-- into the queue over and over.

create table scan_requests (
  track_id text primary key references tracks (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  done_at timestamptz
);

alter table scan_requests enable row level security;

-- Requesting suggestions is the first step of proposing a rendition, so it is
-- gated by the same permission. Everyone who can tag can also see the queue —
-- "requested, waiting" on a recording stops a second tagger requesting it.
create policy "taggers see the scan queue" on scan_requests
  for select to authenticated using (authorize('renditions.propose'));

create policy "taggers request scans" on scan_requests
  for insert to authenticated with check (authorize('renditions.propose'));

-- Only reviewers tidy the queue; the scanner itself writes done_at with the
-- service key, which bypasses RLS.
create policy "reviewers manage the scan queue" on scan_requests
  for delete to authenticated using (authorize('renditions.review'));

grant select, insert on scan_requests to authenticated;
grant delete on scan_requests to authenticated;
grant all on scan_requests to service_role;
