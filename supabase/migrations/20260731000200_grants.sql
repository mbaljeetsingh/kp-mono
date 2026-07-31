-- Table privileges for the PostgREST roles.
--
-- RLS decides which *rows* each role sees; these grants decide whether the
-- role may touch the table at all. Without them PostgREST returns
-- "permission denied for table", which looks like an RLS failure but isn't.

grant usage on schema public to anon, authenticated, service_role;

-- The catalogue is public and read-only. Only the crawler writes it, running
-- as service_role, which also bypasses RLS.
grant select on tracks to anon, authenticated;
grant all    on tracks to service_role;

-- Listening never requires an account, so anon reads segments too — the RLS
-- policy narrows that to `published` rows.
grant select on segments to anon;
grant select, insert, update on segments to authenticated;
grant all on segments to service_role;

grant select on profiles to anon, authenticated;
grant update on profiles to authenticated;
grant all    on profiles to service_role;

grant execute on function artist_counts() to anon, authenticated;
