-- requeue_alignment_on_recut's comment says a re-cut "misses the
-- boundary-keyed transcript cache and pays a full ASR". Since #83 align reads
-- a rendition off its recording's transcript, keyed by recording, model and
-- grid and never by a rendition's edges (track/… in the transcripts bucket),
-- so a re-cut and a re-tag both re-time in seconds once the recording has been
-- transcribed. The old align/… objects stay in the bucket, unread.
--
-- Comment only: nothing about the trigger or its function changes.
comment on function requeue_alignment_on_recut() is
  'Clears line_timings when a rendition is re-cut (start_sec/end_sec) or '
  're-tagged (shabad_id), returning it to the aligner queue, which is '
  '`line_timings is null`. Align reads the recording''s transcript, not '
  'the rendition''s own audio, so either costs seconds of matching once the '
  'recording has been transcribed.';
