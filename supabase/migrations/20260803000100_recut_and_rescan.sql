-- Two review findings, both about lifecycles that were frozen at one step.
--
-- 1. Re-cutting an aligned rendition left its old line timings live forever.
--    Timings are on the absolute track clock, so a re-cut does not corrupt
--    them — but it can orphan them (audio newly inside the boundaries has no
--    timings) and the aligner's queue is `line_timings is null`, so nothing
--    would ever refresh them. Clearing the column on a boundary change puts
--    the rendition straight back in the queue; the next nightly run re-aligns
--    it. Data-driven, no flag to remember, and cheap: the transcript work is
--    cached, so a re-alignment costs seconds of matching, not minutes of ASR.

create function requeue_alignment_on_recut() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.start_sec is distinct from old.start_sec
     or new.end_sec is distinct from old.end_sec then
    new.line_timings := null;
  end if;
  return new;
end;
$$;

create trigger renditions_recut_requeues_alignment
  before update of start_sec, end_sec on renditions
  for each row execute function requeue_alignment_on_recut();

-- 2. A scan request's `done` state was terminal: track_id is the primary key
--    and taggers only held INSERT, so once a scan ran — even one that found
--    nothing on a noisy broadcast — no one could ever ask again. That
--    contradicts the point of stamping done_at ("scanned, nothing found" is
--    an answer, not a dead end): the matcher improves, the model gets
--    upgraded, and yesterday's nothing is next month's suggestion. Re-request
--    is an UPDATE that clears done_at, gated by the same permission as
--    requesting: admin upserts, the queue picks it up that night.

create policy "taggers re-request scans" on scan_requests
  for update to authenticated
  using (authorize('renditions.propose'))
  with check (authorize('renditions.propose'));

grant update on scan_requests to authenticated;
