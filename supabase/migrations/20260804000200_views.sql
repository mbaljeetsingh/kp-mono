-- Read surfaces: the views the apps actually query, and the two RPC
-- functions that aggregate over them.

-- ── shabads ───────────────────────────────────────────────────────────────
-- The player's only read surface.
--
-- The catalogue is 49k audio *files*; the product is shabads. A file is a
-- 70-minute set containing many shabads, so nothing is listenable until
-- someone marks where each one starts and ends. This view exposes exactly
-- that — published renditions, joined to the file they point into. Untagged
-- and part-tagged material simply isn't visible, rather than being surfaced
-- as unusable hour-long blobs.
--
-- `security_invoker` is load-bearing, not decoration: a view runs with its
-- owner's rights by default, and the owner bypasses RLS on renditions — the
-- `status = 'published'` predicate would otherwise be the only thing between
-- an anonymous reader and every unpublished draft. With security_invoker the
-- renditions policy applies as a second, independent barrier.

create view shabads
with (security_invoker = on) as
select
  r.id, r.name, r.start_sec, r.end_sec,
  r.end_sec - r.start_sec as duration_sec,
  r.shabad_id, r.main_verse_id, r.line_timings,
  r.raag, r.taal, r.instrument, r.play_count,
  r.source_ref, r.created_at,
  t.id as track_id, t.url, t.tree,
  -- The rendition's own artist wins; the file's directory is the fallback.
  coalesce(r.artist, t.artist_dir) as artist,
  coalesce(a.display_name, r.artist, t.artist_dir) as artist_display,
  a.photo_path as artist_photo,
  t.date
from renditions r
join tracks t on t.id = r.track_id
left join artists a on a.name = coalesce(r.artist, t.artist_dir)
where r.status = 'published' and t.missing_since is null;

-- ── recordings ────────────────────────────────────────────────────────────
-- The admin tagging queue. 42k files is too many to face as a flat list, and
-- they are not equally worth a contributor's time: shorter recordings finish
-- in one sitting, which is what keeps a volunteer coming back. Day files are
-- 563MB and ~20 hours; nobody should be handed one to scrub.
--
-- This view deliberately does NOT set `security_invoker`, unlike every other
-- view here — and that omission has been reported as an oversight before. It
-- is not. The workbench's todo / in-progress / done split filters on the
-- rendition counts below, which exist to stop two contributors segmenting
-- the same recording. The SELECT policy on renditions hides other people's
-- drafts from anyone without `renditions.review` — correct for rows, but run
-- this view as the invoker and a tagger sees `renditions = 0` on a recording
-- somebody else has already drafted, picks it up, and duplicates the work
-- (measured: a track with two of another contributor's drafts reports 0).
--
-- So the aggregate is deliberately privileged where the rows are not. What
-- leaks is the count, and only the count: every other column comes from
-- tracks and artists, both already granted to anon. The grant is what bounds
-- this — anon has no SELECT, and every signed-in account is a contributor by
-- design ("the trust ladder gates publishing, not participation").
--
-- What WOULD make this wrong, and should be revisited together: giving the
-- admin app a trust gate, so being signed in stops implying being a tagger;
-- or adding a column drawn from a table that is not already public.

create view recordings as
select
  t.id, t.url, t.tree, t.artist_dir, t.date, t.raw_filename, t.title,
  t.slot_start_sec, t.slot_end_sec,
  a.photo_path as artist_photo,
  -- Nominal length straight from the filename slot ("12.00pm to 1.10pm").
  -- Null for puratan, which carries no slot — those sort last rather than
  -- first, since an unknown length is a worse bet than a known short one.
  case
    when t.slot_start_sec is not null and t.slot_end_sec > t.slot_start_sec
      then t.slot_end_sec - t.slot_start_sec
  end as est_seconds,
  coalesce(rc.renditions, 0) as renditions,
  coalesce(rc.published, 0) as published
from tracks t
left join artists a on a.name = t.artist_dir
left join (
  select track_id,
         count(*) as renditions,
         count(*) filter (where status = 'published') as published
  from renditions group by track_id
) rc on rc.track_id = t.id
where t.tree <> 'daywise'
  and t.missing_since is null
  and not (t.flags @> array['unplayable-format']);

comment on view recordings is
  'Tagging queue. Runs as owner ON PURPOSE: the renditions/published counts '
  'must include other contributors'' unpublished drafts or the todo filter '
  'stops preventing duplicated work. Do not add security_invoker — see '
  '20260804000200_views.sql. Bounded by the grant: anon has no SELECT, and '
  'every signed-in account is a contributor by design.';

-- ── playlist_shabads ──────────────────────────────────────────────────────
-- A playlist's renditions joined to everything a row needs to render and
-- play, so opening a playlist is one request rather than two. Joins `shabads`
-- rather than `renditions` so it inherits that view's published filter, and
-- selects sh.* so new columns arrive for free. security_invoker again keeps
-- one user's playlists out of another's reach.
--
-- Favorites get no equivalent view: both modes share one id list
-- (localStorage when signed out), so the page reads ids and then `shabads` —
-- a favorites view would return nothing for exactly the guests who need that
-- page most.

create view playlist_shabads with (security_invoker = true) as
select sh.*, i.playlist_id, i.position, i.added_at
from playlist_items i
join shabads sh on sh.id = i.rendition_id;

-- ── artist aggregates ─────────────────────────────────────────────────────
-- Aggregated in the database rather than the client: 41k rows would
-- otherwise cross the wire to produce ~200 counts. Both count published
-- shabads, not files — an artist with 800 untagged recordings has nothing to
-- show yet.

-- Home grid: artists ranked by how much of them there is to hear.
create function artist_counts()
returns table (
  artist_dir text,
  shabads bigint,
  photo_path text,
  display_name text
)
language sql stable as $$
  select
    sh.artist,
    count(*),
    max(a.photo_path),
    -- a.name is the primary key, so at most one row joins per group and
    -- max() is just "the value" rather than a choice between candidates.
    max(a.display_name)
  from shabads sh
  left join artists a on a.name = sh.artist
  where sh.artist is not null
  group by sh.artist
  order by count(*) desc, sh.artist;
$$;

-- /ragis directory: only ragis you can actually listen to. Listing everyone
-- SGPC publishes was tried and reverted — most of the 230 are still
-- untagged, so the grid filled with cards that lead to an empty page. A ragi
-- appears once one of their shabads is published, which also makes the page
-- a visible measure of tagging progress.
create function artist_directory()
returns table (name text, display_name text, photo_path text, shabads bigint)
language sql stable as $$
  select
    a.name,
    coalesce(a.display_name, a.name),
    a.photo_path,
    count(sh.id)
  from artists a
  join shabads sh on sh.artist = a.name
  group by a.name, a.display_name, a.photo_path
  having count(sh.id) > 0
  order by count(sh.id) desc, a.name;
$$;
