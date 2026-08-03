-- Where ASR transcripts live, so re-runs never pay for ASR twice (issue #32).
--
-- The aligner and scanner cache transcripts on disk (~2.5 KB per audio-minute)
-- which is why re-running the matcher locally costs seconds. A CI runner's
-- disk vanishes after every job, so on GitHub Actions every RE-run — matcher
-- improvement, boundaries re-cut (which now re-queues automatically), model
-- upgrade — would re-pay the full ASR cost. This bucket is the disk that
-- survives the runner.
--
-- Keys are content-addressed, mirroring the local cache names exactly:
--   scan/{track_id}_{win}s{hop}s.json                 whole-broadcast scan
--   align/{rendition}_{start}_{end}_{tag}.json        boundary-keyed cuts
-- The boundaries are IN the key on purpose — a re-cut rendition must miss.
--
-- Private: raw ASR text is a working artifact, not a public one, and the only
-- reader/writer is the batch (service_role, bypasses RLS). No storage.objects
-- policies for the same reason as artist-photos: nothing should reach this
-- bucket from a browser.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'transcripts',
  'transcripts',
  false,
  10485760,
  array['application/json']
)
on conflict (id) do nothing;
