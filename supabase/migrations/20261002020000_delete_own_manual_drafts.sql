-- Authors may delete their own unpublished, hand-made drafts.
--
-- Until now only `renditions.delete` (reviewer and up) could delete anything,
-- so a contributor's misclick or duplicate sat in Review until a reviewer
-- cleared away work its own author already knew was wrong. Such a draft is not
-- live, takes nobody else's listening with it, and never counts toward the
-- trust ladder (only published rows do), so its author can be trusted with it.
--
-- Scan drafts stay with the permission even for the account that requested
-- the scan: deleting one is a rejection (20260930010000) that the scanner
-- honours on that recording for good. A reviewer's call.
--
-- A second policy rather than a widened one: permissive policies are OR-ed, and
-- "delete with permission" keeps reading as what it is.
-- canDeleteRendition in packages/api/src/admin.ts mirrors this for the buttons.
create policy "delete own manual drafts"
  on renditions for delete to authenticated
  using (
    authorize('renditions.propose')
    and created_by = (select auth.uid())
    and status <> 'published'
    and source <> 'scan'
  );
