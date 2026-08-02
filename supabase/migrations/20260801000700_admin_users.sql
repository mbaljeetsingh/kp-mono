-- Who the contributors actually are.
--
-- The users page could only show `profiles`, which carries a display name most
-- accounts never set — so the list read as a column of hex ids. The useful
-- identifier is the email, and that lives in `auth.users`, which no client role
-- can read.
--
-- It deliberately does NOT move email into `profiles`: that table is public
-- (`create policy "profiles are public" ... using (true)`), so an email column
-- there would publish every contributor's address to anonymous visitors. RLS is
-- row-level, so no policy could hide just that column either.
--
-- Instead this is one security-definer function gated on `users.manage`. A
-- caller without the permission gets no rows rather than an error: the page
-- already hides its controls, and nothing here needs to distinguish "not
-- allowed" from "nobody signed up".
create or replace function admin_users()
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

grant execute on function admin_users() to authenticated;
