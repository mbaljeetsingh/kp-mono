-- Shabad titles in Gurmukhi, and publishing needs a shabad (#77).
--
-- Titles were stored only in roman (`name`), so the player could show nothing
-- else: no Gurmukhi titles, no Gurmukhi initials on a tile, no other script
-- later. The Gurmukhi was always one BaniDB call away through main_verse_id,
-- but only the read-along made that call, and only for the shabad playing.
--
-- `name_gurmukhi` is the anchor line (main_verse_id) in Unicode Gurmukhi:
-- BaniDB's verse.unicode with the verse bars, the verse numbers and the rahao
-- marker taken off — the same line, cleaned the same way, that `name` is made
-- from. Switching the player between scripts never switches which line a
-- rendition is known by.
--
-- Unicode, not the Gurbani-font ASCII BaniDB also sends. The title goes where
-- no Gurbani font can follow it — the lock screen, a share sheet, a screen
-- reader — and there the ASCII reads as "hau mwxu qwxu". Any other script is
-- converted from this one on the device, so nothing else is stored.
--
-- `name` stays, and stays roman. Search runs here, where nothing can
-- transliterate; a draft with no shabad linked has only the name its tagger
-- typed; and installed phone builds read it. What changes is who writes it:
-- with a shabad linked nobody types it any more. The workbench, the scanner
-- and packages/aligner/fill_names.py all derive both columns from the anchor.

alter table renditions add column name_gurmukhi text;

comment on column renditions.name_gurmukhi is
  'The anchor line (main_verse_id) in Unicode Gurmukhi, cleaned as `name` is: '
  'no verse bars, verse numbers or rahao marker. Null with no shabad linked, '
  'and until something that has read the line writes it. Written by the '
  'workbench, the scanner and packages/aligner/fill_names.py.';

-- ── the Gurmukhi belongs to one line ──────────────────────────────────────
-- A write that moves the anchor without saying what the new line reads — a
-- workbench tab still running the build from before this migration, an edit
-- in the SQL editor — would leave the old line's Gurmukhi under the new verse
-- id: the wrong title, shown in a script the person who made the change may
-- not read. So the column is cleared instead, and the player falls back to
-- `name` until something that knows the line writes it again: fill_names.py,
-- or the workbench the next time the row is saved.
--
-- "Without saying" is read as "left it unchanged", which is all a trigger can
-- see. Re-anchoring onto a repeated line whose text is identical clears it
-- too; the cost of that rare case is a roman title until the next fill, where
-- the cost of trusting the column is a wrong one.

create function private.gurmukhi_follows_anchor() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.shabad_id is distinct from old.shabad_id
      or new.main_verse_id is distinct from old.main_verse_id)
     and new.name_gurmukhi is not distinct from old.name_gurmukhi then
    new.name_gurmukhi := null;
  end if;
  return new;
end;
$$;

revoke all on function private.gurmukhi_follows_anchor() from public, anon, authenticated;

-- The `of` clause decides which updates fire it at all: an edit that touches
-- neither column cannot move the anchor.
create trigger renditions_gurmukhi_follows_anchor
  before update of shabad_id, main_verse_id on renditions
  for each row execute function private.gurmukhi_follows_anchor();

comment on function private.gurmukhi_follows_anchor() is
  'Clears name_gurmukhi when an update moves the anchor (shabad_id or '
  'main_verse_id) and leaves name_gurmukhi as it was, so the column never '
  'holds another line''s text.';

-- ── publishing needs a shabad ─────────────────────────────────────────────
-- A rendition reaches the player under a title, and with no shabad linked
-- there is no line to take one from: only a roman name somebody typed, with
-- no Gurmukhi for the player to show and nothing the aligner can time. Drafts
-- may still be unlinked — marking where a shabad starts and naming it by ear
-- needs no Gurbani literacy, and that stays open to any contributor — and
-- somebody links the shabad before it goes out.
--
-- A rule on transitions rather than a check constraint. A constraint is
-- checked on every write to a row, so a rendition published unlinked before
-- today would refuse its own play count (register_play updates it). This
-- refuses only the writes that would make a row published-and-unlinked:
-- publishing one with no shabad, and unlinking one that is published
-- (unpublish it first). The rows already in that state stay as they are, and
-- stay editable.

create function private.publish_needs_shabad() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'published' and new.shabad_id is null
     and (tg_op = 'INSERT' or old.status <> 'published' or old.shabad_id is not null) then
    -- check_violation, so PostgREST answers 400 with this sentence as the
    -- message, and the workbench shows it as it is.
    raise exception 'Link a shabad before publishing.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function private.publish_needs_shabad() from public, anon, authenticated;

create trigger renditions_publish_needs_shabad
  before insert or update of status, shabad_id on renditions
  for each row execute function private.publish_needs_shabad();

comment on function private.publish_needs_shabad() is
  'Refuses a write that leaves a rendition published with no shabad_id: '
  'publishing an unlinked one, or unlinking a published one. Rows already in '
  'that state are left alone.';

-- ── the read surfaces ─────────────────────────────────────────────────────
-- `create or replace` may only append columns, so the new one goes last. The
-- rest is 20260804000200_views.sql verbatim; the options are restated because
-- a replace that leaves out `with (...)` drops them, and security_invoker is
-- what keeps unpublished drafts out of this view.

create or replace view shabads
with (security_invoker = on) as
select
  r.id, r.name, r.start_sec, r.end_sec,
  r.end_sec - r.start_sec as duration_sec,
  r.shabad_id, r.main_verse_id, r.line_timings,
  r.raag, r.taal, r.play_count, r.created_at,
  t.id as track_id, t.url, t.tree,
  -- The rendition's own artist wins; the file's directory is the fallback.
  coalesce(r.artist, t.artist_dir) as artist,
  coalesce(a.display_name, r.artist, t.artist_dir) as artist_display,
  a.photo_path as artist_photo,
  t.date,
  r.name_gurmukhi
from renditions r
join tracks t on t.id = r.track_id
left join artists a on a.name = coalesce(r.artist, t.artist_dir)
where r.status = 'published' and t.missing_since is null;

-- playlist_shabads has to be rebuilt to carry it. Its note says it selects
-- sh.* "so new columns arrive for free"; they do not. Postgres expands * when
-- a view is created, so this view kept the columns `shabads` had in August,
-- and a playlist would have shown every title in roman. Dropping and creating
-- it again is what expands the * afresh. Nothing depends on it.
drop view playlist_shabads;

create view playlist_shabads with (security_invoker = true) as
select sh.*, i.playlist_id, i.position, i.added_at
from playlist_items i
join shabads sh on sh.id = i.rendition_id;

-- A new view starts from the default privileges, so it gets the same
-- revoke-then-grant as everything in authz.sql.
revoke all on playlist_shabads from anon, authenticated;
grant select on playlist_shabads to authenticated;

comment on view playlist_shabads is
  'A playlist''s renditions with everything a row needs. sh.* is expanded '
  'when the view is created, not when it is read: drop and recreate this '
  'view whenever `shabads` gains a column, or playlists will not see it.';
