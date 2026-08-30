-- Re-tagging a rendition must requeue its alignment, the same as re-cutting it.
--
-- requeue_alignment_on_recut has fired `before update of start_sec, end_sec`
-- since the baseline, which covers moving the boundaries but not correcting the
-- tag. line_timings is keyed on BaniDB verse_id, so changing shabad_id leaves a
-- rendition holding timings that name verses belonging to the shabad it is no
-- longer tagged with. The player highlights whatever those ids resolve to, and
-- the aligner never notices: its queue is `line_timings is null`, and the row is
-- not null, so nothing recomputes it. Stale forever, and silently.
--
-- This is exactly the operation that fixes a mistag, which makes it the one
-- update most likely to hit the gap. The confidence gate has already caught one
-- real mistag (shabad 3590, scoring 0.520 against the 0.76-0.87 that correct
-- tags measure); the fix for it is a re-tag, and before this migration a re-tag
-- of an already-aligned rendition would have quietly kept the wrong timings.
--
-- Both halves are required. The `of` clause decides which updates fire the
-- trigger at all, so adding the column to the function's condition without
-- adding it there would change nothing.

create or replace function requeue_alignment_on_recut() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.start_sec is distinct from old.start_sec
     or new.end_sec is distinct from old.end_sec
     or new.shabad_id is distinct from old.shabad_id then
    new.line_timings := null;
  end if;
  return new;
end;
$$;

-- `if exists` because the whole statement runs in one transaction with the
-- function replacement above: on a database where this trigger is missing —
-- repaired by hand, restored from a partial dump — a bare drop aborts the
-- transaction, and the `create or replace` rolls back with it. The migration
-- would then be recorded as failed while the retag fix silently did not land.
drop trigger if exists renditions_recut_requeues_alignment on renditions;

create trigger renditions_recut_requeues_alignment
  before update of start_sec, end_sec, shabad_id on renditions
  for each row execute function requeue_alignment_on_recut();

-- The baseline's note on this trigger says re-alignment after a boundary change
-- is cheap "because transcripts are cached". It is not: write_timings.py keys
-- its transcript cache on the boundaries so that a re-cut MUST miss it, and a
-- re-cut therefore pays a full two-pass ASR at roughly 6x the rendition's
-- duration on a CI runner. That note cannot be corrected in place — its
-- migration is applied in production — so the correction lives in
-- write_timings.py beside the cache key, and is repeated here.
--
-- A re-tag is cheaper than a re-cut: the boundaries do not move, so the cached
-- transcripts still apply and only the matching re-runs.

comment on function requeue_alignment_on_recut() is
  'Clears line_timings when a rendition is re-cut (start_sec/end_sec) or '
  're-tagged (shabad_id), returning it to the aligner queue, which is '
  '`line_timings is null`. A re-cut misses the boundary-keyed transcript cache '
  'and pays a full ASR; a re-tag reuses it and only re-matches.';
