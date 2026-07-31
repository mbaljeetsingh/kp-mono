-- Reviewers may create an already-published segment.
--
-- The contributor INSERT policy forbids `status = 'published'` outright, which
-- is correct for contributors but also blocked reviewers from the obvious
-- workflow: tag a shabad and publish it in one action. Policies are OR-ed, so
-- this adds the reviewer path without loosening the contributor one.
create policy "reviewers may insert published segments"
  on segments for insert to authenticated
  with check (is_reviewer());
