-- The artist-photos bucket belongs in the schema, not only in a seed script.
--
-- `seed-artists.ts` calls `createBucket()` before uploading, which works but
-- means the bucket only exists in environments where that script has run. A
-- `db reset` truncates `storage.buckets` along with everything else, so the
-- bucket disappeared and 155 photo rows in `artists` pointed at objects that
-- were no longer there — the ragi tiles went blank with nothing in the database
-- to explain why. Declaring it here means every environment (fresh project,
-- reset local, CI) has somewhere for the photos to land before anything runs.
--
-- Note this migration cannot restore the *files*: object bytes live outside the
-- database (on disk locally, in S3 on a hosted project), so a `pg_dump` carries
-- the `storage.objects` rows but none of the images. Re-running
-- `seed-artists.ts` is what puts them back, and it is idempotent — it uploads
-- with `upsert: true` and re-links by artist name.

-- Public: these are publicity photos SGPC already publishes, and signing each
-- URL would add a round trip per artist tile. 5 MB matches the seed script's
-- own limit; the crawled PNGs are ~40 KB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'artist-photos',
  'artist-photos',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- No INSERT/UPDATE/DELETE policies on `storage.objects` for this bucket, on
-- purpose: the only writer is the crawler, which runs as `service_role` and
-- bypasses RLS. Reads need no policy either — a public bucket is served through
-- the `/object/public/...` endpoint, which does not consult them. Anything that
-- could upload here from a browser would be a way to put arbitrary images on
-- the artist tiles.
