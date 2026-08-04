-- Storage buckets belong in the schema, not only in seed scripts: a
-- `db reset` truncates storage.buckets along with everything else, and a
-- bucket that exists only where a script has run once left 155 photo rows
-- pointing at objects that were no longer there.
--
-- Neither bucket gets storage.objects policies, on purpose: the only writers
-- are batch jobs running as service_role, which bypasses RLS. Anything that
-- could upload to artist-photos from a browser would be a way to put
-- arbitrary images on the artist tiles.
--
-- Note migrations cannot restore the *files*: object bytes live outside the
-- database, so re-running `pnpm seed:artists` is what puts photos back after
-- a reset — it uploads with `upsert: true` and re-links by artist name.

-- Public: these are publicity photos SGPC already publishes, and signing each
-- URL would add a round trip per artist tile. Reads need no policy — a public
-- bucket is served through the /object/public/... endpoint, which does not
-- consult them. 5 MB matches the seed script's own limit; the crawled PNGs
-- are ~40 KB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'artist-photos',
  'artist-photos',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- Where ASR transcripts live, so re-runs never pay for ASR twice (issue #32).
-- The aligner and scanner cache transcripts (~2.5 KB per audio-minute); a CI
-- runner's disk vanishes after every job, so this bucket is the disk that
-- survives the runner. Keys are content-addressed, mirroring the local cache
-- names exactly:
--   scan/{track_id}_{win}s{hop}s.json            whole-broadcast scan
--   align/{rendition}_{start}_{end}_{tag}.json   boundary-keyed cuts
-- The boundaries are IN the key on purpose — a re-cut rendition must miss.
-- Private: raw ASR text is a working artifact, not a public one.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'transcripts',
  'transcripts',
  false,
  10485760,
  array['application/json']
)
on conflict (id) do nothing;
