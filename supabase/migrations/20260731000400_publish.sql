-- Publishing is the one action the trust ladder actually gates.
--
-- Anyone signed in may propose a segment; only reviewers and admins can move
-- it to `published`, which is the moment it becomes visible in the player.
-- Enforced in the database rather than the UI so a contributor cannot publish
-- by calling PostgREST directly.

create function is_reviewer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and trust in ('reviewer', 'admin')
  );
$$;

create policy "reviewers may publish or edit any segment"
  on segments for update to authenticated
  using (is_reviewer())
  with check (is_reviewer());

create policy "reviewers see every segment"
  on segments for select to authenticated
  using (is_reviewer());

create policy "reviewers may delete segments"
  on segments for delete to authenticated
  using (is_reviewer());

grant delete on segments to authenticated;
grant execute on function is_reviewer() to authenticated;
