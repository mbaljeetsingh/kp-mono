-- Rebuild everything that still refers to the old name in its body or title.
-- Postgres rewrites table references inside views and functions automatically,
-- but the *text* stays stale, so these are recreated for readability rather
-- than correctness.

drop view if exists shabads;
create view shabads
with (security_invoker = on) as
select
  r.id, r.name, r.start_sec, r.end_sec,
  r.end_sec - r.start_sec as duration_sec,
  r.shabad_id, r.main_verse_id, r.raag, r.taal, r.instrument, r.play_count,
  r.source_ref, r.created_at,
  t.id as track_id, t.url, t.tree,
  coalesce(r.artist, t.artist_dir) as artist,
  coalesce(a.display_name, r.artist, t.artist_dir) as artist_display,
  a.photo_path as artist_photo,
  t.date
from renditions r
join tracks t on t.id = r.track_id
left join artists a on a.name = coalesce(r.artist, t.artist_dir)
where r.status = 'published' and t.missing_since is null;

grant select on shabads to anon, authenticated;

drop function if exists register_play(uuid) cascade;
create function register_play(rendition uuid) returns void
language sql volatile security definer set search_path = '' as $$
  update public.renditions set play_count = play_count + 1
  where id = rendition and status = 'published';
$$;
grant execute on function register_play(uuid) to anon, authenticated;

create or replace function contribution_stats(person uuid)
returns table (published bigint, pending bigint)
language sql stable security definer set search_path = '' as $$
  select
    count(*) filter (where status = 'published'),
    count(*) filter (where status <> 'published')
  from public.renditions
  where created_by = person;
$$;

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
  from public.renditions
  where created_by = new.created_by and status = 'published';
  if approved >= threshold then
    update public.profiles set trust = 'trusted'
    where id = new.created_by and trust = 'contributor';
  end if;
  return new;
end;
$$;

create or replace function is_reviewer() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.authorize('renditions.review');
$$;

-- Policy names carry the old noun; recreate them under the new one.
drop policy if exists "read published, own, or all with review" on renditions;
drop policy if exists "propose or publish per permission" on renditions;
drop policy if exists "edit own drafts, or any with review" on renditions;
drop policy if exists "delete with permission" on renditions;

create policy "read published, own, or all with review"
  on renditions for select
  using (
    status = 'published'
    or created_by = (select auth.uid())
    or authorize('renditions.review')
  );

create policy "propose or publish per permission"
  on renditions for insert to authenticated
  with check (
    authorize('renditions.propose')
    and created_by = (select auth.uid())
    and (status <> 'published' or authorize('renditions.publish'))
  );

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

-- The admin queue counts renditions per track.
drop view if exists tag_queue;
create view recordings as
select
  t.id, t.url, t.tree, t.artist_dir, t.date, t.raw_filename, t.title,
  t.slot_start_sec, t.slot_end_sec,
  case
    when t.slot_start_sec is not null and t.slot_end_sec > t.slot_start_sec
      then t.slot_end_sec - t.slot_start_sec
  end as est_seconds,
  coalesce(rc.renditions, 0) as renditions,
  coalesce(rc.published, 0) as published
from tracks t
left join (
  select track_id,
         count(*) as renditions,
         count(*) filter (where status = 'published') as published
  from renditions group by track_id
) rc on rc.track_id = t.id
where t.tree <> 'daywise'
  and t.missing_since is null
  and not (t.flags @> array['unplayable-format']);

grant select on recordings to authenticated;
grant select on renditions to anon;
grant select, insert, update, delete on renditions to authenticated;
grant all on renditions to service_role;
