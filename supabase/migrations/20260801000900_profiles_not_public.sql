-- `profiles` stops being world-readable.
--
-- It was public from the first migration, when a profile held a display name
-- and a trust level and the only accounts were taggers. Two things changed:
-- listeners now have accounts too (favorites, playlists), so this table is a
-- register of everyone who uses the player; and the admin users page — the one
-- consumer that read the table broadly — now goes through `admin_users()`.
--
-- As it stood, `anon` could enumerate every account on the instance and read
-- each one's trust level, which is both a privacy leak and a map of who is
-- worth attacking. Nothing in either app needs that: the player never reads
-- profiles at all, and the admin page reads only its own row (for `canManage`)
-- plus the security-definer function.
--
-- This is also the prerequisite for holding an email here the way np-mono's
-- `users` table does — its policy is owner-read for exactly this reason.

drop policy if exists "profiles are public" on profiles;

-- Own row always; every row with `users.manage`, which is what the admin page's
-- own-row check and the trust editor need.
create policy "read own profile, or any with users.manage"
  on profiles for select to authenticated
  using (id = (select auth.uid()) or authorize('users.manage'));

-- `anon` loses the table entirely. Note the six functions that read profiles —
-- authorize(), is_reviewer(), set_trust(), admin_users(), maybe_promote() and
-- handle_new_user() — are all `security definer`, so they bypass RLS and are
-- unaffected. The policy subqueries that read profiles inline (the `blocked`
-- check on renditions INSERT, the admin check in set_role_permission's
-- ancestors) run as the caller and only ever look at the caller's own row,
-- which owner-read still allows.
revoke select on profiles from anon;

-- Foreign keys from favorites and playlists point at profiles. Referential
-- integrity is checked by the system, not the caller, so it does not consult
-- these policies — a listener can still save a favorite without being able to
-- read anybody's profile.
