-- Follow-up to 20261001030000_rendition_gurmukhi_names.sql, from its review.
--
-- A file of its own rather than an edit: that migration may already be
-- applied in production, and an applied migration is never edited.
--
-- 1. Publishing needs the line, not only the shabad. Both titles are read off
--    main_verse_id, and a linked rendition without one — a few from before the
--    workbench always set it — would go out with a typed roman name and no
--    Gurmukhi, the outcome the rule exists to prevent. It is refused on the
--    same terms as a missing shabad: only the writes that make a rendition
--    published without its line; the rows already in that state stay
--    editable.
--
-- 2. The refusal says which rule. Unlinking a published rendition was refused
--    with "Link a shabad before publishing." — to someone who was not
--    publishing anything.
--
-- 3. The anchor guard misfired. It cleared name_gurmukhi whenever the anchor
--    moved and the value came in unchanged, but the workbench always sends it,
--    and the same line can be two verses: 33 shabads in the Guru Granth Sahib
--    repeat a line (shabad 54's refrain is four), and six are near-copies of
--    another (52 and 510). Moving between two copies sends the same, correct
--    text, and the guard threw it away. What only a writer that does not know
--    the column does is rename the row for its new line and leave the old
--    Gurmukhi beside it — the workbench before this change did exactly that
--    when a line was clicked — so that is what clears it now. And with no
--    shabad there is no line: unlinking clears it, whoever does it.
--
-- A correction to the earlier file's comments, which cannot be edited: they
-- speak of the player falling back to `name` where name_gurmukhi is null.
-- The player does not read name_gurmukhi yet — that is the next change. Null
-- leaves `name` the rendition's only title, which is what they meant.

create or replace function private.publish_needs_shabad() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'published'
     and (new.shabad_id is null or new.main_verse_id is null)
     and (tg_op = 'INSERT' or old.status <> 'published'
          or (old.shabad_id is not null and old.main_verse_id is not null)) then
    -- check_violation, so PostgREST answers 400 with the sentence as the
    -- message, and the workbench shows it as it is.
    raise exception '%',
      case
        when tg_op = 'UPDATE' and old.status = 'published'
          then 'A published shabad keeps its link and main verse. Unpublish it first.'
        when new.shabad_id is null
          then 'Link a shabad before publishing.'
        else 'Choose the main verse before publishing.'
      end
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- The `of` list gains main_verse_id: removing it from a published rendition is
-- now one of the writes the rule refuses.
drop trigger if exists renditions_publish_needs_shabad on renditions;
create trigger renditions_publish_needs_shabad
  before insert or update of status, shabad_id, main_verse_id on renditions
  for each row execute function private.publish_needs_shabad();

comment on function private.publish_needs_shabad() is
  'Refuses a write that leaves a rendition published without its line: '
  'publishing one with no shabad_id or main_verse_id, or removing either from '
  'a published one. Rows already in that state are left alone.';

create or replace function private.gurmukhi_follows_anchor() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.shabad_id is null then
    new.name_gurmukhi := null;
  elsif (new.shabad_id is distinct from old.shabad_id
         or new.main_verse_id is distinct from old.main_verse_id)
        and new.name is distinct from old.name
        and new.name_gurmukhi is not distinct from old.name_gurmukhi then
    new.name_gurmukhi := null;
  end if;
  return new;
end;
$$;

comment on function private.gurmukhi_follows_anchor() is
  'Clears name_gurmukhi when a rendition loses its shabad, or when an update '
  'moves the anchor and renames the row but leaves name_gurmukhi as it was: '
  'a writer that does not know the column. Moving between identical lines, '
  'which renames nothing, keeps it.';
