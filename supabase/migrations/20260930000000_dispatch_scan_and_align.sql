-- Start scan and align the moment there is work for them.
--
-- Both workflows ran nightly and nothing else. A tagger who pressed Suggest
-- shabads waited for 04:17 UTC — in practice hours later, because GitHub starts
-- scheduled runs late under load (scan.yml's header has the measurements) — and
-- a rendition published at noon got its lyrics timed the next morning. The work
-- itself is ~10 minutes for a 35-minute duty; the wait was the schedule.
--
-- So the database starts the run. When a statement puts work in either queue —
-- a scan request, or a published rendition with no line timings — a trigger
-- asks GitHub to run that workflow now (the workflow_dispatch API, through
-- pg_net). The nightly schedules stay, as the sweep for anything a dispatch
-- missed.
--
-- Why a trigger:
--   * It sees every write that queues work, whoever makes it: both admin
--     buttons, a publish from Review, a re-cut or re-tag that clears
--     line_timings (requeue_alignment_on_recut) — with no client change, and no
--     client that can forget to call something after its write.
--   * An Edge Function would hold the same token and be one more deploy.
--   * Supabase's dashboard "Database Webhooks" are this same mechanism, but they
--     send Supabase's payload ({type, table, record, ...}), GitHub accepts only
--     its own ({ref, inputs}), and they live in the dashboard, not a migration.
--
-- The token is a fine-grained GitHub token (this repository only, Actions: read
-- and write), kept in Vault as `github_dispatch_token`. The owner creates it in
-- the SQL editor; it is never in a file. Without it nothing is sent — the state
-- of every local and CI database, so a click on a laptop can never start a
-- production run.
--
-- Dispatches carry no inputs, because every run drains its queue: scan_track.py
-- re-reads scan_requests after each track, and write_timings.py takes every
-- `line_timings is null` row it has time for. That is what makes one dispatch
-- per click safe. Each workflow runs one at a time (its concurrency group), and
-- GitHub keeps only ONE pending run per group, cancelling the older: a burst of
-- clicks becomes one running and one pending run, and no request is lost to
-- the cancellation, since whichever run comes next takes it. It also means a
-- dispatch works against any revision of the workflows — none requires an
-- input.
--
-- A dispatch is a shortcut, never a requirement. pg_net queues the request in
-- this transaction and sends it after commit, without waiting for the answer,
-- so nothing here can slow or fail the write that queued the work. A refused
-- dispatch — an expired token answers 401 — shows only in net._http_response,
-- and the nightly run picks the work up regardless.
--
-- No loops: nothing the workflows write puts a row back in a queue. The
-- scanner's scan_requests PATCH sets done_at (only Scan again clears it); its
-- drafts are not published, and carry line_timings anyway; align's PATCH fills
-- line_timings, which takes the row out of its queue, and a rendition align's
-- confidence gate refuses is not written at all.

create extension if not exists pg_net with schema extensions;

-- Not in the API's schemas (config.toml [api]) and not usable by any API role:
-- these functions exist for the triggers below and nothing else.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- security definer because the trigger runs as whoever wrote the row — a
-- tagger — who can read neither Vault nor, on a hardened project, net.
create or replace function private.dispatch_workflow(workflow text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  token text;
begin
  select decrypted_secret into token
  from vault.decrypted_secrets
  where name = 'github_dispatch_token';
  if coalesce(token, '') = '' then
    return;
  end if;

  perform net.http_post(
    url := 'https://api.github.com/repos/mbaljeetsingh/kp-mono/actions/workflows/'
           || workflow || '/dispatches',
    body := jsonb_build_object('ref', 'main'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      -- GitHub refuses a request without one (403).
      'User-Agent', 'kp-mono-dispatch',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 5000
  );
exception when others then
  -- The tagger's write must land whatever happens here: pg_net missing, Vault
  -- unreadable. The nightly run is the fallback for exactly this.
  raise warning 'dispatching % failed: %', workflow, sqlerrm;
end;
$$;

-- Statement-level, so a statement is one dispatch however many rows it
-- touches, and with transition tables, so the check sees what the statement
-- actually changed. An upsert that found the recording already queued (the
-- button's ignoreDuplicates) still fires an INSERT trigger — with no rows — and
-- must not dispatch. `requested_by is not null` keeps it to people asking: a
-- bulk fill of the queue that nobody requested is left to the nightly run.
create or replace function private.dispatch_scan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from new_rows where requested_by is not null) then
      perform private.dispatch_workflow('scan.yml');
    end if;
  -- Scan again: a scanned recording's done_at cleared.
  elsif exists (
    select 1
    from new_rows n join old_rows o using (track_id)
    where o.done_at is not null and n.done_at is null
      and n.requested_by is not null
  ) then
    perform private.dispatch_workflow('scan.yml');
  end if;
  return null;
end;
$$;

-- Align's queue is data (align.yml): published, shabad linked, no line timings.
-- Dispatch when a statement moves a row INTO it — a publish, or a re-cut or
-- re-tag of a published rendition (requeue_alignment_on_recut clears
-- line_timings before the row is written, so the transition table already
-- shows it null) — not on every edit of a row that was already waiting.
create or replace function private.dispatch_align() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if exists (
      select 1 from new_rows
      where status = 'published' and shabad_id is not null and line_timings is null
    ) then
      perform private.dispatch_workflow('align.yml');
    end if;
  elsif exists (
    select 1
    from new_rows n join old_rows o using (id)
    where n.status = 'published' and n.shabad_id is not null and n.line_timings is null
      and not (o.status = 'published' and o.shabad_id is not null and o.line_timings is null)
  ) then
    perform private.dispatch_workflow('align.yml');
  end if;
  return null;
end;
$$;

-- Revoke-then-grant, as authz.sql does, with nothing to grant: triggers call
-- these, people don't.
revoke all on function private.dispatch_workflow(text) from public, anon, authenticated;
revoke all on function private.dispatch_scan() from public, anon, authenticated;
revoke all on function private.dispatch_align() from public, anon, authenticated;

-- Postgres allows transition tables only on single-event triggers, so INSERT and
-- UPDATE are separate triggers on the same function.
create trigger scan_requests_dispatch_scan_insert
  after insert on public.scan_requests
  referencing new table as new_rows
  for each statement execute function private.dispatch_scan();

create trigger scan_requests_dispatch_scan_update
  after update on public.scan_requests
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.dispatch_scan();

create trigger renditions_dispatch_align_insert
  after insert on public.renditions
  referencing new table as new_rows
  for each statement execute function private.dispatch_align();

create trigger renditions_dispatch_align_update
  after update on public.renditions
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.dispatch_align();

comment on function private.dispatch_workflow(text) is
  'Asks GitHub to run .github/workflows/<workflow> on main now, with the Vault '
  'secret github_dispatch_token. Does nothing without the secret; never raises.';
comment on function private.dispatch_scan() is
  'Dispatches scan.yml when a statement queues a scan request someone made, or '
  'clears done_at on one (Scan again).';
comment on function private.dispatch_align() is
  'Dispatches align.yml when a statement moves a rendition into align''s queue: '
  'published, shabad_id set, line_timings null.';
