-- Per-line timings, so the lyrics panel can follow the singing.
--
-- Until now nothing mapped a second of audio to a line: `start_sec`/`end_sec`
-- are the rendition's own boundaries and `main_verse_id` is a single untimed
-- anchor. Issue #30 has the working prototype and the numbers; this is only the
-- place to put its output.
--
-- Shape, sorted by `start`:
--
--   [ {"verse_id": 52522, "start": 245.0, "end": 295.0},
--     {"verse_id": 52523, "start": 295.0, "end": 305.0}, ... ]
--
-- Three decisions worth not re-deriving:
--
-- 1. Times are ABSOLUTE seconds into the track file — the same clock as
--    `start_sec`/`end_sec` and as the `<audio>` element. Not relative to the
--    rendition. Renditions get re-cut as tagging improves, and the audio does
--    not move when they do, so absolute times survive a boundary edit while
--    relative ones would silently shift every line.
--
-- 2. Keyed on BaniDB `verse_id`, not on the line's index within the shabad.
--    Verified against /shabads/4377: `verse_id = verses[line_idx].verseId`,
--    which is what `main_verse_id` already holds and what the panel already
--    renders and highlights. An index would be one BaniDB revision away from
--    pointing at the wrong line.
--
-- 3. JSONB on the rendition rather than a child table. It is always read whole,
--    in one shot, when the panel opens — there is no query that wants a single
--    line — and writing it is one idempotent UPDATE per aligned rendition.
--
-- Coverage is deliberately SPARSE. Gaps mean nothing is being sung — alaap,
-- instrumental passages, katha between verses — and the panel must show no
-- highlight there rather than holding the previous line on screen. Only part of
-- a shabad is often sung, so lines may be missing entirely.
--
-- Null means "not aligned yet", which is the whole archive today and will stay
-- true for most of it for a long time.

alter table renditions
  add column line_timings jsonb;

comment on column renditions.line_timings is
  'Per-line singing times from audio alignment: [{verse_id, start, end}], '
  'sorted by start. Times are absolute seconds into the track, matching '
  'start_sec/end_sec. Sparse — gaps mean nothing is being sung. Null until '
  'the rendition has been aligned. See issue #30.';

-- Only written by the alignment batch, which runs out-of-band with the service
-- key. No app-facing policy change: `renditions` already restricts UPDATE, and
-- the service key bypasses RLS.

-- Republish the view so the player can read the column. Recreated in full
-- rather than patched, matching how the other renames in this directory handle
-- it — the body is the source of truth people read.
--
-- `playlist_shabads` selects `sh.*` from this view, so it has to come down with
-- it and go back up after. It picks the new column up for free, which is the
-- reason it is `sh.*` in the first place.
drop view if exists shabads cascade;
create view shabads
with (security_invoker = on) as
select
  r.id, r.name, r.start_sec, r.end_sec,
  r.end_sec - r.start_sec as duration_sec,
  r.shabad_id, r.main_verse_id, r.line_timings,
  r.raag, r.taal, r.instrument, r.play_count,
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

create view playlist_shabads with (security_invoker = true) as
select sh.*, i.playlist_id, i.position, i.added_at
from playlist_items i
join shabads sh on sh.id = i.rendition_id;

grant select on playlist_shabads to authenticated;
