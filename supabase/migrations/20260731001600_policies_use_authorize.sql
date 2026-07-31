-- Point every segment policy at authorize(), so the permission matrix is the
-- single source of truth rather than six independent hardcoded trust checks.
--
-- Behaviour is intended to be identical to before for the seeded defaults;
-- what changes is that an admin can now alter it without a migration.

drop policy if exists "signed-in users may propose segments" on segments;
drop policy if exists "trusted contributors may publish their own segments" on segments;
drop policy if exists "authors may edit their unpublished segments" on segments;
drop policy if exists "reviewers may publish or edit any segment" on segments;
drop policy if exists "reviewers see every segment" on segments;
drop policy if exists "reviewers may delete segments" on segments;
drop policy if exists "reviewers may insert published segments" on segments;
drop policy if exists "published segments are public" on segments;

-- Read: anyone sees published work; authors see their own; reviewers see all.
create policy "read published, own, or all with review"
  on segments for select
  using (
    status = 'published'
    or created_by = (select auth.uid())
    or authorize('segments.review')
  );

-- Insert: proposing needs the permission. Publishing outright additionally
-- needs `segments.publish`, which is what separates trusted from contributor.
create policy "propose or publish per permission"
  on segments for insert to authenticated
  with check (
    authorize('segments.propose')
    and created_by = (select auth.uid())
    and (status <> 'published' or authorize('segments.publish'))
  );

-- Update: authors may revise their own unpublished work; publishing it or
-- touching anyone else's requires the corresponding permission.
create policy "edit own drafts, or any with review"
  on segments for update to authenticated
  using (
    (created_by = (select auth.uid()) and status <> 'published')
    or authorize('segments.review')
  )
  with check (
    authorize('segments.review')
    or (
      created_by = (select auth.uid())
      and (status <> 'published' or authorize('segments.publish'))
    )
  );

create policy "delete with permission"
  on segments for delete to authenticated
  using (authorize('segments.delete'));

-- Artists follow the same pattern.
drop policy if exists "reviewers may edit artists" on artists;
create policy "edit artists with permission"
  on artists for all to authenticated
  using (authorize('artists.edit')) with check (authorize('artists.edit'));

-- set_trust() was gated on a literal admin check; move it onto the matrix too.
create or replace function set_trust(target uuid, level trust_level)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.authorize('users.manage') then
    raise exception 'not permitted to change trust levels';
  end if;
  if target = (select auth.uid()) then
    raise exception 'trust level cannot be changed on your own account';
  end if;
  update public.profiles set trust = level where id = target;
end;
$$;

-- is_reviewer() is retained so existing callers keep working, but it now
-- reads through the matrix rather than matching role names.
create or replace function is_reviewer() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.authorize('segments.review');
$$;
