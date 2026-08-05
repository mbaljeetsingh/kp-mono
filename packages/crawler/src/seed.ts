/**
 * Load a crawl into Postgres.
 *
 * Runs against the service role, which bypasses RLS — the catalogue is
 * public-read but written only by this job, never by the apps.
 *
 * Idempotent: upserts on the track's stable id, so a nightly re-crawl updates
 * in place. Never deletes — `renditions.track_id` is ON DELETE CASCADE, so a
 * removed track row would take its tags with it. Files that vanish from the
 * archive are stamped `missing_since` instead, which the views already exclude.
 *
 * Track ids are recomputed here rather than trusted from the crawl file, so a
 * crawl taken before the identity rule settled still lands with correct keys.
 * The definition is shared with the crawler in `track-id.ts` — it was duplicated
 * in both, the copies drifted, and the seeder's silently won.
 *
 * Refuses to run on a sample crawl, on a crawl with too many errors, or on one
 * that would shrink the catalogue sharply. All three have a real incident
 * behind them.
 *
 *   node --experimental-strip-types src/seed.ts [--force]
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { stableId } from './track-id.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../out/crawl.json');

/** Bypasses the count and error guards below. Never bypasses the sample guard. */
const FORCE = process.argv.includes('--force');

/**
 * How far the catalogue may shrink in one run before the seeder stops. A real
 * crawl loses a handful of files to SGPC reorganising; it does not lose a third
 * of them. 2% of the catalogue arriving as a "successful" sample crawl is the
 * case this exists for.
 */
const MAX_DROP = 0.1;

/** A crawl this broken must not be trusted to say what the catalogue contains. */
const MAX_ERRORS = 50;

const URL_ = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54521';
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

const client = createClient(URL_, KEY, { auth: { persistSession: false } });

const report = JSON.parse(await readFile(OUT, 'utf8'));
const now = new Date().toISOString();

// ── guards ────────────────────────────────────────────────────────────────
// Everything below refuses *before* the first write. A seeder that discovers a
// problem halfway through has already replaced part of the catalogue.

function refuse(message: string, forceable = true): never {
  console.error(`refusing to seed: ${message}`);
  if (forceable) console.error('Pass --force if this is genuinely intended.');
  process.exit(1);
}

// The issue's framing was "the seeder loads whatever it is handed", and a
// truncated or half-written JSON is exactly that — without this, a file missing
// its `tracks` key throws an unhandled TypeError further down instead of
// refusing cleanly, and a file missing `errors` skips the error guard silently.
if (!Array.isArray(report.tracks) || !Array.isArray(report.errors)) {
  refuse(
    'out/crawl.json is not a complete crawl report (missing `tracks` or `errors`).',
    false
  );
}

// Deliberately not forceable. A sample crawl reaching a production
// SUPABASE_URL is the exact failure this guard exists to prevent, and folding
// it into the same --force that waves through an expected shrink would mean one
// flag covers both a judgement call and an accident. Re-run without --sample.
if (report.sample === true) {
  refuse(
    'out/crawl.json is a sample crawl (report.sample is true). Run a full crawl.',
    false
  );
}

if (report.errors?.length > MAX_ERRORS && !FORCE) {
  refuse(
    `the crawl reported ${report.errors.length} errors (limit ${MAX_ERRORS}). ` +
      'A partly-failed crawl cannot say what the catalogue contains.'
  );
}

const { count: existing, error: countError } = await client
  .from('tracks')
  .select('*', { count: 'exact', head: true });

// A guard that cannot read the current state must not wave the run through.
// Failing open here would mean an unreachable database silently disables the
// one check standing between a bad crawl and the catalogue.
if (countError) {
  refuse(`could not count existing tracks — ${countError.message}`, false);
}

const incoming = report.tracks.length;
// `existing === 0` is a first seed into an empty database, which must not trip
// the guard — there is nothing to shrink. Same arithmetic, deliberately.
const drop = existing ? (existing - incoming) / existing : 0;
if (drop > MAX_DROP && !FORCE) {
  refuse(
    `the crawl holds ${incoming} tracks against ${existing} already in the ` +
      `database — a ${Math.round(drop * 100)}% drop (limit ${Math.round(MAX_DROP * 100)}%).`
  );
}

// Recomputing ids can collapse genuine duplicates (SGPC lists some files twice
// under slightly different names). Deduping here keeps the upsert from failing
// on a repeated key inside a single batch.
//
// This used to hide a bug rather than only collapsing duplicates: `dir` was
// missing from the crawl file, so undated daywise files in different months
// computed the same id and one was dropped here as a "duplicate". With `dir`
// serialised and one shared `stableId`, a collision reported below is a real
// duplicate — so an unexpected jump in that count is worth looking at.
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
    // `first_seen_at` is deliberately absent. It used to be sent, with a
    // comment claiming it was omitted on conflict — but supabase-js builds
    // ON CONFLICT DO UPDATE over every key in the payload, so nothing
    // implemented that intent. Since the crawl stamps `firstSeenAt` at crawl
    // time, every re-seed pushed the column *forward* to the latest crawl: it
    // recorded "last crawl" for every row and the real first-seen date was
    // gone. Leaving the key out lets the column default on insert and stay
    // untouched on update, which is what the comment always claimed.
    last_seen_at: now,
    // Correct for rows in this crawl, including a file that went missing and
    // came back. Rows *absent* from the crawl are stamped after the upserts.
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

// Every row this run touched carries `last_seen_at = now`, so anything older
// was not in this crawl. Stamping it is how a reorganisation becomes visible on
// the day it happens: the views already exclude `missing_since is not null`, so
// a vanished file drops out of the player while its renditions stay attached to
// the row, recoverable.
//
// Never a delete. `renditions.track_id` is ON DELETE CASCADE, so removing a
// track row would take its tags with it, unrecoverably.
//
// Skipped under --force: the guards above are the only evidence that this crawl
// saw the whole archive, and a crawl too broken to seed on its own merits is
// certainly too broken to declare thousands of files missing.
if (FORCE) {
  console.log('--force: skipping the missing_since pass (crawl not trusted).');
} else {
  const { count: wentMissing, error: missingError } = await client
    .from('tracks')
    .update({ missing_since: now }, { count: 'exact' })
    .lt('last_seen_at', now)
    .is('missing_since', null);
  if (missingError) {
    console.error(`missing_since pass failed: ${missingError.message}`);
    process.exit(1);
  }
  if (wentMissing) {
    console.log(
      `${wentMissing} track(s) absent from this crawl — stamped missing_since. ` +
        'A large number here means SGPC reorganised; their renditions are kept.'
    );
  }
}

const { count } = await client
  .from('tracks')
  .select('*', { count: 'exact', head: true });
console.log(`done — ${count} tracks in database`);
