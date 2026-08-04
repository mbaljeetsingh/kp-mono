-- Authorization: RLS policies, table/function grants, and the default
-- permission matrix.
--
-- Two independent layers, and both matter:
--   * GRANTs decide whether a role may touch a table at all. Without them
--     PostgREST returns "permission denied for table", which looks like an
--     RLS failure but isn't.
--   * RLS policies decide which *rows* each role sees.
-- The crawler and batch jobs run as service_role, which bypasses RLS.

grant usage on schema public to anon, authenticated, service_role;

alter table tracks           enable row level security;
alter table profiles         enable row level security;
alter table artists          enable row level security;
alter table renditions       enable row level security;
alter table role_permissions enable row level security;
alter table favorites        enable row level security;
alter table playlists        enable row level security;
alter table playlist_items   enable row level security;
alter table scan_requests    enable row level security;

-- The local bootstrap auto-grants a residue of privileges (TRUNCATE,
-- REFERENCES, TRIGGER, MAINTAIN) to the API roles on every new table. RLS
-- governs row operations only, so no policy can police those — and the grant
-- should say what it means. Start every object from zero, then grant exactly
-- what is intended. New tables should follow the same revoke-then-grant
-- pattern.
revoke all on tracks           from anon, authenticated;
revoke all on profiles         from anon, authenticated;
revoke all on artists          from anon, authenticated;
revoke all on renditions       from anon, authenticated;
revoke all on role_permissions from anon, authenticated;
revoke all on favorites        from anon, authenticated;
revoke all on playlists        from anon, authenticated;
revoke all on playlist_items   from anon, authenticated;
revoke all on scan_requests    from anon, authenticated;
revoke all on shabads          from anon, authenticated;
revoke all on recordings       from anon, authenticated;
revoke all on playlist_shabads from anon, authenticated;

-- ── tracks ────────────────────────────────────────────────────────────────
-- The catalogue is public and read-only; only the crawler writes it.

create policy "tracks are public"
  on tracks for select using (true);

grant select on tracks to anon, authenticated;
grant all    on tracks to service_role;

-- ── profiles ──────────────────────────────────────────────────────────────
-- NOT world-readable: listeners have accounts too (favorites, playlists), so
-- this table is a register of everyone who uses the player, and world-read
-- would let anon enumerate every account and its trust level — a privacy
-- leak and a map of who is worth attacking. The admin users page goes
-- through admin_users() instead; the definer functions that read profiles
-- bypass RLS and are unaffected.

create policy "read own profile, or any with users.manage"
  on profiles for select to authenticated
  using (id = (select auth.uid()) or authorize('users.manage'));

create policy "users may edit their own profile"
  on profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant select on profiles to authenticated;
-- Column-level, and `trust` is deliberately absent: RLS cannot express "this
-- row but not this column", and a whole-table UPDATE grant once let any
-- contributor PATCH themselves to trust='admin' (verified exploitable).
-- Trust moves only through set_trust().
grant update (display_name) on profiles to authenticated;
grant all on profiles to service_role;

-- ── artists ───────────────────────────────────────────────────────────────

create policy "artists are public"
  on artists for select using (true);

create policy "edit artists with permission"
  on artists for all to authenticated
  using (authorize('artists.edit')) with check (authorize('artists.edit'));

grant select on artists to anon;
-- Not `grant all`: that would also hand authenticated TRUNCATE, TRIGGER and
-- REFERENCES, none of which RLS can police.
grant select, insert, update, delete on artists to authenticated;
grant all on artists to service_role;

-- ── renditions ────────────────────────────────────────────────────────────
-- Listening never requires an account, so anon reads renditions too — the
-- SELECT policy narrows that to published rows.

-- Read: anyone sees published work; authors see their own; reviewers see all.
create policy "read published, own, or all with review"
  on renditions for select
  using (
    status = 'published'
    or created_by = (select auth.uid())
    or authorize('renditions.review')
  );

-- Insert: proposing needs the permission. Publishing outright additionally
-- needs `renditions.publish`, which is what separates trusted from
-- contributor. `blocked` holds no permissions at all, so it can do neither.
create policy "propose or publish per permission"
  on renditions for insert to authenticated
  with check (
    authorize('renditions.propose')
    and created_by = (select auth.uid())
    and (status <> 'published' or authorize('renditions.publish'))
  );

-- Update: authors may revise their own unpublished work; publishing it or
-- touching anyone else's requires the corresponding permission.
create policy "edit own drafts, or any with review"
  on renditions for update to authenticated
  using (
    (created_by = (select auth.uid()) and status <> 'published')
    or authorize('renditions.review')
  )
  with check (
    authorize('renditions.review')
    or (
      created_by = (select auth.uid())
      and (status <> 'published' or authorize('renditions.publish'))
    )
  );

create policy "delete with permission"
  on renditions for delete to authenticated
  using (authorize('renditions.delete'));

grant select on renditions to anon;
grant select, insert, update, delete on renditions to authenticated;
grant all on renditions to service_role;

-- ── role_permissions ──────────────────────────────────────────────────────
-- Readable by anyone signed in, so the admin UI can render the matrix.
-- Writable only through set_role_permission().

create policy "role permissions are readable"
  on role_permissions for select to authenticated using (true);

grant select on role_permissions to authenticated;

-- Defaults. `blocked` deliberately gets no rows: absence of a grant is the
-- block. `trusted` publishes its own work without review — the reward for a
-- track record — but still cannot touch anyone else's.
insert into role_permissions (role, permission) values
  ('contributor', 'renditions.propose'),

  ('trusted', 'renditions.propose'),
  ('trusted', 'renditions.publish'),

  ('reviewer', 'renditions.propose'),
  ('reviewer', 'renditions.publish'),
  ('reviewer', 'renditions.review'),
  ('reviewer', 'renditions.delete'),
  ('reviewer', 'artists.edit'),

  ('admin', 'renditions.propose'),
  ('admin', 'renditions.publish'),
  ('admin', 'renditions.review'),
  ('admin', 'renditions.delete'),
  ('admin', 'artists.edit'),
  ('admin', 'users.manage');

-- ── favorites / playlists ─────────────────────────────────────────────────
-- Everything here is private to its owner. Unlike renditions there is no
-- public read at all: anon gets no grant, and no policy admits a non-owner.

create policy "users read their own favorites"
  on favorites for select to authenticated
  using (user_id = (select auth.uid()));

create policy "users save their own favorites"
  on favorites for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "users remove their own favorites"
  on favorites for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "users read their own playlists"
  on playlists for select to authenticated
  using (user_id = (select auth.uid()));

create policy "users create their own playlists"
  on playlists for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "users rename their own playlists"
  on playlists for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "users delete their own playlists"
  on playlists for delete to authenticated
  using (user_id = (select auth.uid()));

-- Playlist items carry no `user_id` — they are owned through their parent,
-- so every policy is an EXISTS against `playlists`. Note INSERT needs a
-- `with check`: a `using` clause alone is silently ignored on insert, which
-- would leave anyone able to append to anyone's playlist.
create policy "users read items in their own playlists"
  on playlist_items for select to authenticated
  using (
    exists (
      select 1 from playlists p
      where p.id = playlist_id and p.user_id = (select auth.uid())
    )
  );

create policy "users add items to their own playlists"
  on playlist_items for insert to authenticated
  with check (
    exists (
      select 1 from playlists p
      where p.id = playlist_id and p.user_id = (select auth.uid())
    )
  );

create policy "users reorder items in their own playlists"
  on playlist_items for update to authenticated
  using (
    exists (
      select 1 from playlists p
      where p.id = playlist_id and p.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from playlists p
      where p.id = playlist_id and p.user_id = (select auth.uid())
    )
  );

create policy "users remove items from their own playlists"
  on playlist_items for delete to authenticated
  using (
    exists (
      select 1 from playlists p
      where p.id = playlist_id and p.user_id = (select auth.uid())
    )
  );

grant select, insert, delete on favorites to authenticated;
grant all on favorites to service_role;

grant select, insert, update, delete on playlists to authenticated;
grant all on playlists to service_role;

grant select, insert, update, delete on playlist_items to authenticated;
grant all on playlist_items to service_role;

-- ── scan_requests ─────────────────────────────────────────────────────────
-- Requesting suggestions is the first step of proposing a rendition, so it
-- is gated by the same permission. Everyone who can tag sees the queue —
-- "requested, waiting" on a recording stops a second tagger requesting it.

create policy "taggers see the scan queue" on scan_requests
  for select to authenticated using (authorize('renditions.propose'));

create policy "taggers request scans" on scan_requests
  for insert to authenticated with check (authorize('renditions.propose'));

-- Re-request after a scan found nothing: an UPDATE that clears done_at.
create policy "taggers re-request scans" on scan_requests
  for update to authenticated
  using (authorize('renditions.propose'))
  with check (authorize('renditions.propose'));

-- Only reviewers tidy the queue; the scanner itself writes done_at with the
-- service key, which bypasses RLS.
create policy "reviewers manage the scan queue" on scan_requests
  for delete to authenticated using (authorize('renditions.review'));

grant select, insert, update, delete on scan_requests to authenticated;
grant all on scan_requests to service_role;

-- ── views ─────────────────────────────────────────────────────────────────

grant select on shabads to anon, authenticated;
grant select on recordings to authenticated;  -- deliberately not anon; see the view
grant select on playlist_shabads to authenticated;

-- ── functions ─────────────────────────────────────────────────────────────

grant execute on function artist_counts()       to anon, authenticated;
grant execute on function artist_directory()    to anon, authenticated;
grant execute on function register_play(uuid)   to anon, authenticated;

grant execute on function authorize(app_permission)       to authenticated;
grant execute on function set_trust(uuid, trust_level)    to authenticated;
grant execute on function set_role_permission(trust_level, app_permission, boolean) to authenticated;
grant execute on function contribution_stats(uuid)        to authenticated;
grant execute on function admin_users()                   to authenticated;
