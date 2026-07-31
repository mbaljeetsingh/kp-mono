/**
 * Load a crawl into Postgres.
 *
 * Runs against the service role, which bypasses RLS — the catalogue is
 * public-read but written only by this job, never by the apps.
 *
 * Idempotent: upserts on the track's stable id, so a nightly re-crawl updates
 * in place. Track ids are recomputed here rather than trusted from the crawl
 * file, so a crawl taken before the identity rule settled still lands with
 * correct keys.
 *
 *   node --experimental-strip-types src/seed.ts
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../out/crawl.json');
const URL_ = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
// Never defaulted: the service role bypasses RLS, so a key baked into the repo
// is a key that outlives the machine that generated it.
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) {
  console.error(
    'SUPABASE_SERVICE_KEY is required. Get the local one from `npx supabase status`.'
  );
  process.exit(1);
}

const BATCH = 500;
const sha1 = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);

/**
 * Identity is the content's natural key, never the URL. SGPC has reorganised
 * this archive once already; a URL-derived id would orphan every segment
 * attached to a file the next time one moves.
 */
function stableId({ tree, artistDir, date, slotStartSec, title, rawFilename }) {
  const parts =
    tree === 'daywise'
      ? [tree, date ?? rawFilename, String(slotStartSec ?? '')]
      : tree === 'puratan'
        ? [tree, artistDir ?? '', title ?? rawFilename]
        : [
            tree,
            artistDir ?? '',
            date ?? '',
            String(slotStartSec ?? ''),
            rawFilename,
          ];
  return sha1(parts.join('|').toLowerCase());
}

const client = createClient(URL_, KEY, { auth: { persistSession: false } });

const report = JSON.parse(await readFile(OUT, 'utf8'));
const now = new Date().toISOString();

// Recomputing ids can collapse genuine duplicates (SGPC lists some files twice
// under slightly different names). Deduping here keeps the upsert from failing
// on a repeated key inside a single batch.
const seen = new Set();
const rows = [];
for (const t of report.tracks) {
  const id = stableId(t);
  if (seen.has(id)) continue;
  seen.add(id);
  rows.push({
    id,
    tree: t.tree,
    url: t.url,
    artist_dir: t.artistDir,
    artist_in_file: t.artistInFilename,
    date: t.date,
    slot_start_sec: t.slotStartSec,
    slot_end_sec: t.slotEndSec,
    slot_end_open: t.slotEndIsOpen,
    title: t.title,
    size_bytes: t.sizeBytes,
    modified_at: t.modifiedAt,
    raw_filename: t.rawFilename,
    // Recomputed from flags so the confidence rule can change without
    // re-fetching 670 pages from sgpc.net.
    confidence: t.flags.includes('no-date')
      ? 'low'
      : t.flags.filter((f) => f !== 'artist-mismatch').length
        ? 'medium'
        : 'high',
    flags: t.flags,
    // Deliberately omitted from the upsert payload below on conflict — see
    // the note before the loop. Kept here for the insert case only.
    first_seen_at: t.firstSeenAt,
    last_seen_at: now,
    missing_since: null,
  });
}

console.log(
  `seeding ${rows.length} tracks (${report.tracks.length - rows.length} duplicates collapsed)`
);

for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  const { error } = await client
    .from('tracks')
    .upsert(chunk, { onConflict: 'id' });
  if (error) {
    console.error(`batch at ${i} failed:`, error.message);
    process.exit(1);
  }
  if ((i / BATCH) % 10 === 0)
    console.log(`  ${i + chunk.length}/${rows.length}`);
}

const { count } = await client
  .from('tracks')
  .select('*', { count: 'exact', head: true });
console.log(`done — ${count} tracks in database`);
