-- What the tag page can say about a scan request besides "queued" (#81): that
-- a run has taken it and where that run is, or that it failed and why.
--
-- A click starts a run at once (20260930000000_dispatch_scan_and_align.sql),
-- but the page could only poll done_at. A run that never started (no token in
-- Vault, a refused dispatch), one still going, and one that failed on a dead
-- sgpc.net URL all read the same: queued, for as long as anyone waited.

alter table scan_requests
  add column started_at timestamptz,
  -- Rendered as a link on the tag page, so only ever a GitHub Actions run.
  add column run_url text
    check (run_url ~ '^https://github\.com/[^/]+/[^/]+/actions/runs/[0-9]+$'),
  add column error text;

comment on column scan_requests.started_at is
  'When a scan run last took this request. Older than requested_at = an '
  'earlier attempt: this one has not started.';
comment on column scan_requests.run_url is
  'The GitHub Actions run that took it last (scan_track.py, from the runner''s '
  'environment).';
comment on column scan_requests.error is
  'Why the last attempt failed; cleared when a run takes it again or a person '
  'asks again. The request stays queued (done_at null) for a retry.';

-- Scan again on a request that FAILED must start a run too. The update trigger
-- fired only when done_at was cleared, and a failed request never had one, so
-- asking again waited for the nightly sweep. Asking again always moves
-- requested_at (packages/api rescan); the scanner never touches it, so its
-- own writes — started_at, run_url, error, done_at — still start nothing.
create or replace function private.dispatch_scan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from new_rows where requested_by is not null) then
      perform private.dispatch_workflow('scan.yml');
    end if;
  -- Scan again: a scanned recording's done_at cleared, or a waiting or failed
  -- one asked for again.
  elsif exists (
    select 1
    from new_rows n join old_rows o using (track_id)
    where n.done_at is null and n.requested_by is not null
      and (o.done_at is not null or n.requested_at > o.requested_at)
  ) then
    perform private.dispatch_workflow('scan.yml');
  end if;
  return null;
end;
$$;
