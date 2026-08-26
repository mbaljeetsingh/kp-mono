-- The permission matrix needs to render capabilities nothing holds yet.
--
-- Those empty cells are exactly the ones an admin comes to the page to tick,
-- so the grid cannot be built from role_permissions alone — it needs the full
-- enum. Reading it from the database keeps the client from carrying its own
-- copy of the list, which is the mistake users.vue already records ("it
-- hardcoded a row of role_permissions into the client"). `scans.request`
-- arrived that way and appears here for free.
--
-- Writing the matrix needs nothing new: set_role_permission() has been the
-- write path since 20260804000100 — security definer, gated on
-- `users.manage`, and already refusing to touch admin/users.manage so the
-- instance cannot lock itself out of its own matrix. role_permissions
-- deliberately has no INSERT/DELETE policy or grant precisely so that
-- function stays the only door ("Writable only through set_role_permission()",
-- 20260804000300_authz.sql:141). Adding policies here would have opened a
-- second door with a weaker lock — the guard only covers revoking, not
-- granting — so it is left shut.
create function app_permissions() returns setof app_permission
language sql stable set search_path = '' as $$
  select unnest(enum_range(null::public.app_permission));
$$;

grant execute on function app_permissions() to authenticated;
