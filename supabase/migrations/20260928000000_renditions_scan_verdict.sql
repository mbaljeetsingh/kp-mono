-- What the scanner concluded about each draft it wrote.
--
-- The scanner now aligns its own drafts (scan_track.py runs align on the
-- recording's transcript), so it knows two independent things about every
-- draft: how well the shabad won its stretch of audio, and how well align,
-- reading line by line, agrees. Together they decide whether a draft would be
-- safe to publish with no human listening — and before that is ever switched
-- on, weeks of drafts have to show what it WOULD have published against what
-- taggers actually did. That comparison needs the verdict kept on the row; a
-- log line on a CI runner is gone in 90 days and cannot be joined to anything.
--
-- jsonb, not columns: the fields are the scanner's working numbers and will
-- move as it is re-measured, and nothing filters on them yet. Null on every
-- rendition a human made, and on scan drafts written before this migration.
alter table renditions add column scan_verdict jsonb;

comment on column renditions.scan_verdict is
  'Scanner''s verdict on a draft it wrote: {confidence, margin, '
  'align_confidence, auto, published}. auto = every auto-publish gate cleared; '
  'published = it actually published itself (only with AUTO_PUBLISH=1). Null '
  'for human-made renditions.';
