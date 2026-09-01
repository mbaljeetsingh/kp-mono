-- The recordings view learns how much of each recording is still untagged,
-- and a tagger can declare one fully tagged.
--
-- `renditions` and `published` count rows, and a count cannot tell a finished
-- recording from one somebody published two shabads out of and walked away
-- from: both read "has published work". The workbench's Done shelf filtered on
-- exactly that, so a 70-minute set with 60 untagged minutes sat on Done —
-- invisible to the next tagger looking for work.
--
-- `untagged_seconds` is the recording's best-guess length minus its tagged
-- coverage. Spans are merged before measuring — the same rule the tag page
-- uses — so overlapping cuts cannot push coverage past 100% or hide a gap.
--
-- The length is a guess by necessity: tracks carry no measured duration, only
-- the slot estimate from the filename ("12.00pm to 1.10pm"), which routinely
-- disagrees with the audio by minutes. The furthest tagged end_sec is a hard
-- lower bound (it was placed against the real audio clock), so the guess is
-- greatest(slot estimate, furthest cut). Gaps BETWEEN cuts are exact; only the
-- tail past the last cut inherits the slot's error, which is why the app
-- filters on this with slack rather than demanding zero.
--
-- NULL when there is no slot at all (the whole puratan tree, and any filename
-- the parser could not read). Falling back to the furthest cut there would
-- make the tail structurally invisible — one published shabad at the top of a
-- 40-minute recording would read as zero untagged and land on Done, the exact
-- bug this column exists to fix. Unknown is a different answer from covered,
-- and the shelves treat NULL as "still open until a human says otherwise".
--
-- That human assertion is `tagged_done_at`: coverage can only measure, it
-- cannot hear that the last fifteen minutes are announcements, simran or
-- ardas — or know the length at all when the slot is missing. On tracks
-- rather than its own table: one bit and its provenance, a property of the
-- recording. Reversible by design — unmarking clears both columns. Who may
-- write them is a capability of its own (`tracks.mark_done`, next two
-- migrations — Postgres refuses to use an enum value in the transaction that
-- adds it).

alter table tracks add column tagged_done_at timestamptz;
alter table tracks add column tagged_done_by uuid
  constraint tracks_tagged_done_by_fkey
  references profiles on delete set null;

-- Replaced, not altered: the view keeps running as owner ON PURPOSE — the
-- counts must include other contributors' unpublished drafts or the todo
-- filter stops preventing duplicated work. Do not add security_invoker; the
-- full argument lives in 20260804000200_views.sql.

create or replace view recordings as
select
  t.id, t.url, t.tree, t.artist_dir, t.date, t.raw_filename, t.title,
  t.slot_start_sec, t.slot_end_sec,
  a.photo_path as artist_photo,
  est.seconds as est_seconds,
  coalesce(rc.renditions, 0) as renditions,
  coalesce(rc.published, 0) as published,
  case
    when est.seconds is not null then greatest(
      round(
        greatest(est.seconds, coalesce(rc.max_end_sec, 0))
          - coalesce(rc.tagged_seconds, 0)
      )::int,
      0
    )
  end as untagged_seconds,
  t.tagged_done_at
from tracks t
-- Nominal length straight from the filename slot; null for puratan, which
-- carries no slot. Computed once here so the est_seconds column and the
-- untagged_seconds arithmetic cannot drift apart.
cross join lateral (
  select case
    when t.slot_start_sec is not null and t.slot_end_sec > t.slot_start_sec
      then t.slot_end_sec - t.slot_start_sec
  end as seconds
) est
left join artists a on a.name = t.artist_dir
left join (
  -- Union length per track: each span contributes only what reaches past the
  -- furthest end seen so far, so overlaps count once. Every status counts as
  -- coverage — a draft still occupies its minutes.
  select track_id,
         count(*) as renditions,
         count(*) filter (where status = 'published') as published,
         sum(greatest(end_sec - greatest(start_sec, coalesce(prev_end, 0)), 0))
           as tagged_seconds,
         max(end_sec) as max_end_sec
  from (
    select track_id, start_sec, end_sec, status,
           max(end_sec) over (
             partition by track_id
             order by start_sec, end_sec
             rows between unbounded preceding and 1 preceding
           ) as prev_end
    from renditions
  ) spans
  group by track_id
) rc on rc.track_id = t.id
where t.tree <> 'daywise'
  and t.missing_since is null
  and not (t.flags @> array['unplayable-format']);

comment on view recordings is
  'Tagging queue. Runs as owner ON PURPOSE: the renditions/published counts '
  'must include other contributors'' unpublished drafts or the todo filter '
  'stops preventing duplicated work. Do not add security_invoker — see '
  '20260804000200_views.sql. Bounded by the grant: anon has no SELECT, and '
  'every signed-in account is a contributor by design. untagged_seconds is '
  'estimate-based (slot length vs merged coverage) — filter with slack, '
  'never on zero — and NULL when the length is unknowable (no slot); '
  'tagged_done_at is a tagger''s assertion that the rest is not shabads.';
