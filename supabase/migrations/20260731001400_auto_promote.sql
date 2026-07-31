-- How many of a contributor's segments have been published, and how many
-- rejected. Rejections matter: volume alone should not promote someone whose
-- work is usually wrong.
create or replace function contribution_stats(person uuid)
returns table (published bigint, pending bigint)
language sql stable security definer set search_path = '' as $$
  select
    count(*) filter (where status = 'published'),
    count(*) filter (where status <> 'published')
  from public.segments
  where created_by = person;
$$;

grant execute on function contribution_stats(uuid) to authenticated;

-- Promote a contributor to `trusted` once enough of their work has been
-- approved. `trusted` means their segments publish without review — the point
-- of the ladder, and the only thing that keeps review from becoming a
-- bottleneck as coverage grows.
--
-- Deliberately stops at `trusted`: approving *other people's* work is a
-- judgment call about someone's judgment, so `reviewer` and `admin` stay
-- manual. Volume can earn you autonomy; it should not earn you authority.
create or replace function maybe_promote() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  approved bigint;
  threshold constant bigint := 20;
begin
  if new.status <> 'published' or new.created_by is null then
    return new;
  end if;

  select count(*) into approved
  from public.segments
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
  after insert or update of status on segments
  for each row execute function maybe_promote();

-- A blocked account keeps its history but can no longer contribute. Policies
-- are OR-ed, so the existing contributor INSERT policy has to be replaced
-- rather than supplemented — an extra restrictive policy would not remove the
-- permission the old one grants.
drop policy if exists "signed-in users may propose segments" on segments;
create policy "signed-in users may propose segments"
  on segments for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and status <> 'published'
    and not exists (
      select 1 from profiles
      where id = (select auth.uid()) and trust = 'blocked'
    )
  );

-- `trusted` publishes without review; still cannot approve anyone else's work.
create policy "trusted contributors may publish their own segments"
  on segments for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from profiles
      where id = (select auth.uid()) and trust = 'trusted'
    )
  );
