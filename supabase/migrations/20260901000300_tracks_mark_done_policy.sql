-- Point the tagged_done columns at the capability added in the previous
-- migration, and seed it to admin alone: taggers just tag, and the judgment
-- that a recording is finished stays with whoever reviews the whole queue.
--
-- A row rather than a condition, as ever: role_permissions is data precisely
-- so that handing this to reviewers later is a click in the permission
-- matrix, not a deploy.
insert into role_permissions (role, permission)
values ('admin', 'tracks.mark_done')
on conflict (role, permission) do nothing;

-- The catalogue stays read-only to contributors except for exactly these two
-- columns: the column list on the GRANT is the fence (any other column in the
-- UPDATE fails on the grant), the policy decides who — and keeps the
-- provenance honest: a mark carries the marker's own id or, when clearing,
-- none at all.
create policy "reviewers mark a recording fully tagged"
  on tracks for update to authenticated
  using (authorize('tracks.mark_done'))
  with check (
    authorize('tracks.mark_done')
    and (tagged_done_by is null or tagged_done_by = (select auth.uid()))
  );

grant update (tagged_done_at, tagged_done_by) on tracks to authenticated;
