-- Point scan_requests at the capability added in the previous migration, and
-- give it to admin only.
--
-- Seeded for admin alone, but deliberately as a row rather than a condition:
-- role_permissions is data precisely so that letting reviewers request scans
-- later is an admin action in the permission matrix, not a deploy.
insert into role_permissions (role, permission)
values ('admin', 'scans.request')
on conflict (role, permission) do nothing;

-- Only the WRITES move. SELECT deliberately stays on `renditions.propose`:
-- this table carries `findings` as well as the queue, and the tagging page
-- reads it to draw the scanner's listen-here pointers on the timeline
-- (apps/admin/app/pages/tag/[id].vue). Those pointers are the entire product
-- of a scan, and the people who need them are the taggers — narrowing the read
-- would have left the scanner's output visible only to admins, who are the
-- least likely to be doing the tagging, and it would have failed silently:
-- a filtered row is indistinguishable from "no scan ran".
--
-- What a non-requester loses is the queue *marker* in the recordings list,
-- which the UI hides for them anyway since they have no button to pair it with.
drop policy "taggers request scans"        on scan_requests;
drop policy "taggers re-request scans"     on scan_requests;

create policy "scan requesters request scans" on scan_requests
  for insert to authenticated with check (authorize('scans.request'));

create policy "scan requesters re-request scans" on scan_requests
  for update to authenticated
  using (authorize('scans.request'))
  with check (authorize('scans.request'));

-- Unchanged: tidying the queue stays with reviewers, and the scanner still
-- writes done_at with the service key, which bypasses RLS entirely.
