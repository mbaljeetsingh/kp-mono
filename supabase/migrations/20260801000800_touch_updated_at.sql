-- `renditions.updated_at` has had a default since the first migration and no
-- trigger, so it has only ever recorded creation time. That was harmless while
-- rows were written once; now that the tagger can revise a published rendition
-- — rename it, relink the shabad, move a boundary — a column that reports the
-- last change has to actually report it, or "when was this last touched" is a
-- question the table answers wrongly.
--
-- Shared function rather than one per table, as np-mono does: the next table
-- that wants this attaches a trigger instead of copying a body.
create or replace function touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- `when` clause so a no-op UPDATE (PostgREST sends every column, and publishing
-- from the list re-sends unchanged values) does not move the timestamp.
create trigger renditions_touch_updated_at
  before update on renditions
  for each row when (old.* is distinct from new.*)
  execute function touch_updated_at();

-- Existing rows keep created_at as their updated_at, which is accurate: none of
-- them has been edited since the column started being maintained.
