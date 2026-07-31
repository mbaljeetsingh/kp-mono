-- Defence-in-depth hardening.

-- 1. `grant all` on artists also hands `authenticated` TRUNCATE, TRIGGER and
-- REFERENCES. RLS governs row operations only, so the "reviewers may edit
-- artists" policy cannot police any of those three. Not reachable through
-- PostgREST today, but the grant should say what it means.
revoke all on artists from authenticated;
grant select, insert, update, delete on artists to authenticated;

-- 2. Make the player's view honour the caller's RLS.
--
-- A view runs with its owner's rights by default, and the owner bypasses RLS
-- on segments entirely — so the `status = 'published'` predicate below was the
-- *only* thing standing between an anonymous reader and every unpublished
-- draft. That is a lot of weight for one WHERE clause that any future edit
-- could drop. With security_invoker the segments policy applies as a second,
-- independent barrier.
alter view shabads set (security_invoker = on);

-- 3. Pin SECURITY DEFINER functions to an empty search_path and fully qualify
-- their references, so a relation in the session's temp schema can never
-- shadow the intended table.
create or replace function is_reviewer() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and trust in ('reviewer', 'admin')
  );
$$;

create or replace function register_play(segment uuid) returns void
language sql volatile security definer set search_path = '' as $$
  update public.segments set play_count = play_count + 1
  where id = segment and status = 'published';
$$;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;
