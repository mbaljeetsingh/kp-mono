-- A signed-in user deletes their own account.
--
-- Both app stores require it of any app that lets you create an account: the
-- App Store (guideline 5.1.1(v)) wants it inside the app, Google Play also wants
-- a web page that explains how. The mobile app's Saved tab and the player's
-- /privacy page are those two places; this is what both end in.
--
-- What goes and what stays is already the schema's, decided by the foreign
-- keys rather than here: the profile, favorites and playlists cascade away;
-- renditions someone tagged (created_by), recordings they marked done
-- (tagged_done_by), scans they asked for (requested_by) and drafts they
-- rejected (rejected_by) are set null. Tagging is shared work other people
-- listen to — deleting an account must not delete the archive's timings with
-- it. account.db.test.ts holds the schema to that.
--
-- security definer because only the auth schema's owner can delete from
-- auth.users; the function deletes exactly one row, the caller's, and takes no
-- argument that could name anyone else.
create or replace function public.delete_own_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  -- The last admin leaving would leave nobody able to set anyone's trust, and
  -- that can only be repaired from the SQL editor. Hand it on first.
  if exists (select 1 from public.profiles where id = me and trust = 'admin')
     and not exists (
       select 1 from public.profiles where trust = 'admin' and id <> me
     ) then
    raise exception 'the only admin cannot delete their account'
      using errcode = 'P0001';
  end if;
  delete from auth.users where id = me;
end;
$$;

comment on function public.delete_own_account() is
  'Deletes the calling user''s auth account. Personal data cascades; shared '
  'tagging work is kept with its author set null. Required by both app stores.';

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
