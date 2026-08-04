-- Functions and triggers.
--
-- Every SECURITY DEFINER function pins an empty search_path and fully
-- qualifies its references, so a relation in the session's temp schema can
-- never shadow the intended table.

-- ── account creation ──────────────────────────────────────────────────────
-- Every account gets a profile; `contributor` means "can propose, can't
-- publish". A player signup lands here too — that grants nothing new, since
-- signup has always been open and contributors never publish unreviewed.

create function handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── authorization ─────────────────────────────────────────────────────────
-- One question, asked by every policy: does the caller's role hold this
-- capability? The role_permissions table is the single source of truth.

create function authorize(requested app_permission)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.role_permissions rp
    join public.profiles p on p.trust = rp.role
    where p.id = (select auth.uid()) and rp.permission = requested
  );
$$;

-- Trust changes go through a definer function that `users.manage` alone may
-- call, so promotion is never a plain table write.
create function set_trust(target uuid, level trust_level)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.authorize('users.manage') then
    raise exception 'not permitted to change trust levels';
  end if;

  -- An admin demoting themselves could leave the archive with no admin at
  -- all, and self-promotion is the escalation this guard exists to prevent.
  if target = (select auth.uid()) then
    raise exception 'trust level cannot be changed on your own account';
  end if;

  update public.profiles set trust = level where id = target;
end;
$$;

-- Only an admin may change the permission matrix, and only through this
-- function — the table itself has no INSERT/UPDATE/DELETE grant for
-- `authenticated`.
create function set_role_permission(
  target_role trust_level,
  target_permission app_permission,
  enabled boolean
) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.authorize('users.manage') then
    raise exception 'not permitted to change role permissions';
  end if;

  -- An admin removing their own ability to manage users would lock the
  -- instance out of its own permission matrix with no way back in.
  if target_role = 'admin' and target_permission = 'users.manage' then
    raise exception 'admin must retain users.manage';
  end if;

  if enabled then
    insert into public.role_permissions (role, permission)
    values (target_role, target_permission)
    on conflict (role, permission) do nothing;
  else
    delete from public.role_permissions
    where role = target_role and permission = target_permission;
  end if;
end;
$$;

-- ── plays ─────────────────────────────────────────────────────────────────
-- Incremented through a definer function so anonymous listeners can register
-- a play without being granted UPDATE on renditions (which would also let
-- them edit tags).

create function register_play(rendition uuid) returns void
language sql volatile security definer set search_path = '' as $$
  update public.renditions set play_count = play_count + 1
  where id = rendition and status = 'published';
$$;

-- ── trust progression ─────────────────────────────────────────────────────
-- How many of a contributor's renditions have been published, and how many
-- are pending — the numbers the trust ladder turns on.

create function contribution_stats(person uuid)
returns table (published bigint, pending bigint)
language sql stable security definer set search_path = '' as $$
  select
    count(*) filter (where status = 'published'),
    count(*) filter (where status <> 'published')
  from public.renditions
  where created_by = person;
$$;

-- Promote a contributor to `trusted` once enough of their work has been
-- approved. `trusted` means their renditions publish without review — the
-- point of the ladder, and the only thing that keeps review from becoming a
-- bottleneck as coverage grows.
--
-- Deliberately stops at `trusted`: approving *other people's* work is a
-- judgment call about someone's judgment, so `reviewer` and `admin` stay
-- manual. Volume can earn you autonomy; it should not earn you authority.
create function maybe_promote() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  approved bigint;
  threshold constant bigint := 20;
begin
  if new.status <> 'published' or new.created_by is null then
    return new;
  end if;

  select count(*) into approved
  from public.renditions
  where created_by = new.created_by and status = 'published';

  if approved >= threshold then
    update public.profiles
    set trust = 'trusted'
    where id = new.created_by and trust = 'contributor';
  end if;

  return new;
end;
$$;

create trigger promote_on_publish
  after insert or update of status on renditions
  for each row execute function maybe_promote();

-- ── admin user list ───────────────────────────────────────────────────────
-- The useful identifier for an account is its email, which lives in
-- auth.users where no client role can read it. Deliberately NOT a column on
-- `profiles`: a caller without `users.manage` gets no rows rather than an
-- error — the page already hides its controls, and nothing needs to
-- distinguish "not allowed" from "nobody signed up".

create function admin_users()
returns table (
  id           uuid,
  email        text,
  display_name text,
  trust        trust_level,
  created_at   timestamptz,
  published    bigint
)
language sql stable security definer set search_path = '' as $$
  select
    p.id,
    u.email::text,
    p.display_name,
    p.trust,
    p.created_at,
    -- Published count, because "who is contributing" is the other thing this
    -- page is read for, and it is the number the trust ladder turns on.
    count(r.id) filter (where r.status = 'published') as published
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.renditions r on r.created_by = p.id
  where public.authorize('users.manage')
  group by p.id, u.email, p.display_name, p.trust, p.created_at
  order by p.created_at;
$$;

-- ── housekeeping triggers ─────────────────────────────────────────────────

-- Shared rather than one per table, as np-mono does: the next table that
-- wants this attaches a trigger instead of copying a body.
create function touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- `when` clause so a no-op UPDATE (PostgREST sends every column, and
-- publishing from the list re-sends unchanged values) does not move the
-- timestamp.
create trigger renditions_touch_updated_at
  before update on renditions
  for each row when (old.* is distinct from new.*)
  execute function touch_updated_at();

-- Re-cutting an aligned rendition orphans its line timings (audio newly
-- inside the boundaries has none), and the aligner's queue is
-- `line_timings is null` — so clearing the column on a boundary change puts
-- the rendition straight back in the queue. Data-driven, no flag to
-- remember, and cheap: transcripts are cached, so re-alignment costs seconds
-- of matching, not minutes of ASR.
create function requeue_alignment_on_recut() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.start_sec is distinct from old.start_sec
     or new.end_sec is distinct from old.end_sec then
    new.line_timings := null;
  end if;
  return new;
end;
$$;

create trigger renditions_recut_requeues_alignment
  before update of start_sec, end_sec on renditions
  for each row execute function requeue_alignment_on_recut();

-- Append at the end without a read-then-write round trip from the client,
-- which would also race with itself on a double tap. `security definer`
-- because the row-level policy on `playlist_items` would otherwise hide the
-- existing rows from this max().
create function set_playlist_item_position() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.position = 0 then
    select coalesce(max(position), 0) + 1 into new.position
    from public.playlist_items
    where playlist_id = new.playlist_id;
  end if;
  return new;
end;
$$;

create trigger playlist_items_set_position
  before insert on playlist_items
  for each row execute function set_playlist_item_position();
