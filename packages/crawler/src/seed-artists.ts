/**
 * Upload crawled artist photos to Supabase Storage and point `artists` at them.
 *
 * Runs after `crawl-artists.ts`. Kept separate from the track seeder because
 * the roster changes on a completely different cadence — recordings arrive
 * weekly, photos essentially never — and because a failure here should not
 * stop the catalogue from loading.
 *
 *   node --experimental-strip-types src/seed-artists.ts
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../out');
const BUCKET = 'artist-photos';

const URL_ = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54521';
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) {
  console.error(
    'SUPABASE_SERVICE_KEY is required. Get the local one from `npx supabase status`.'
  );
  process.exit(1);
}

const client = createClient(URL_, KEY, { auth: { persistSession: false } });

const { manifest, errors } = JSON.parse(
  await readFile(join(OUT, 'artists.json'), 'utf8')
);
console.log(
  `${manifest.length} photos to upload (${errors.length} had no image on SGPC)`
);

// Public bucket: these are publicity photos already published on sgpc.net, and
// serving them through a signed URL would mean a round trip per artist tile.
const { error: bucketError } = await client.storage.createBucket(BUCKET, {
  public: true,
  fileSizeLimit: 5 * 1024 * 1024,
});
if (bucketError && !/already exists/i.test(bucketError.message)) {
  console.error('bucket:', bucketError.message);
  process.exit(1);
}

let uploaded = 0;
let linked = 0;
const failures: string[] = [];

for (const item of manifest) {
  const bytes = await readFile(join(OUT, 'artist-photos', item.file));
  const { error: uploadError } = await client.storage
    .from(BUCKET)
    .upload(item.file, bytes, { contentType: 'image/png', upsert: true });
  if (uploadError) {
    failures.push(`${item.name}: ${uploadError.message}`);
    continue;
  }
  uploaded++;

  // Matched on the directory name, which is the artist key everywhere else.
  // A roster entry with no matching directory is reported rather than
  // inserted — an artist SGPC lists but publishes no recordings for is not
  // something the player can do anything with.
  // `head: true` returns no rows and reports count 0 even on a successful
  // update, which made this report 0 links while the database was in fact
  // updated. Ask for the rows back instead.
  const { data: updated, error: linkError } = await client
    .from('artists')
    .update({ photo_path: item.file, updated_at: new Date().toISOString() })
    .eq('name', item.name)
    .select('name');
  if (linkError) failures.push(`${item.name}: ${linkError.message}`);
  else if (updated?.length) linked++;
}

console.log(`uploaded ${uploaded}, linked to ${linked} artists`);
if (linked < uploaded) {
  console.log(
    `  ${uploaded - linked} photos had no matching artist row — SGPC's roster ` +
      `and its recording directories do not use identical names`
  );
}
if (failures.length) {
  console.log(`  ${failures.length} failures, first: ${failures[0]}`);
}
