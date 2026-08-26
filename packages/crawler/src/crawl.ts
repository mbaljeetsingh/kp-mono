/**
 * Full crawl of the three sgpc.net trees → JSON on disk + a coverage report.
 *
 * Deliberately does NOT touch Postgres. The schema should be designed after
 * looking at what the archive actually contains (how many undated files, how
 * many artist conflicts, how many empty months), not guessed at beforehand.
 *
 * No audio is downloaded — only directory listings are fetched. The whole
 * catalogue is a few MB of metadata; playback streams straight from sgpc.net.
 *
 *   node --experimental-strip-types src/crawl.ts [--sample]
 */
import { mkdir, writeFile, rename, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseListing } from './listings.ts';
import { parseFilename, artistsDisagree } from './parse-filename.ts';
import { stableId, sha1 } from './track-id.ts';

const ROOT = 'https://sgpc.net';
const TREES = {
  ragiwise: `${ROOT}/ragiwise/`,
  puratan: `${ROOT}/puratanlkirtan/`,
  daywise: `${ROOT}/kirtan/`,
} as const;

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../out');
const RATE_MS = 1000;
const SAMPLE = process.argv.includes('--sample');
/** Seed anyway when a whole tree came back empty — see the guard in main(). */
const ALLOW_PARTIAL = process.argv.includes('--allow-partial');

const UA =
  'kirtan-player-crawler/0.1 (archive indexer; contact: baljeet@underlings.com)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let requestCount = 0;
const errors = [];

/** decodeURIComponent throws on a malformed %-sequence; one bad filename must
 *  not discard an entire crawl, which writes nothing to disk until the end. */
function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Rate-limited GET with retry. Cloudflare 429/403 is the failure to survive. */
async function get(url, attempt = 0) {
  await sleep(RATE_MS);
  requestCount++;
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(45_000),
    });
    if (res.status === 429 || res.status >= 500)
      throw new Error(`HTTP ${res.status}`);
    if (!res.ok) {
      errors.push({ url, message: `HTTP ${res.status}` });
      return null;
    }
    return await res.text();
  } catch (err) {
    if (attempt < 3) {
      await sleep(5000 * (attempt + 1));
      return get(url, attempt + 1);
    }
    errors.push({ url, message: String(err?.message ?? err) });
    return null;
  }
}

function makeTrack({
  tree,
  url,
  artistDir,
  rawFilename,
  sizeBytes,
  modifiedAt,
  now,
  dir,
}) {
  const p = parseFilename(rawFilename, tree);
  const flags = [...p.flags];

  // The directory is the artist of record, full stop. SGPC's filenames carry
  // enough typos ("Agaykar" for "Agyakar") that disagreement is the norm, not
  // a signal — treating it as one produced a ~22% review queue that told us
  // nothing. Still recorded as `artistInFilename` + an informational flag so a
  // genuinely misfiled track can be found later on demand, but it no longer
  // costs confidence or creates upfront work.
  if (artistDir && artistsDisagree(artistDir, p.artistInFilename)) {
    flags.push('artist-mismatch');
  }

  const confidence = p.flags.some((f) => f === 'no-date')
    ? 'low'
    : p.flags.length
      ? 'medium'
      : 'high';

  return {
    id: stableId({
      tree,
      artistDir,
      date: p.date,
      slotStartSec: p.slotStartSec,
      title: p.title,
      rawFilename,
      dir,
    }),
    /** Changes when SGPC moves a file; never used as a key. */
    urlId: sha1(url),
    tree,
    url,
    // Serialised because the seeder recomputes ids from this file and needs the
    // same inputs the id was built from. Omitting it was the whole bug: the
    // seeder fell back to `date ?? rawFilename` and undated daywise files in
    // different months collided.
    dir: dir ?? null,
    artistDir: artistDir ?? null,
    artistInFilename: p.artistInFilename,
    date: p.date,
    slotStartSec: p.slotStartSec,
    slotEndSec: p.slotEndSec,
    slotEndIsOpen: p.slotEndIsOpen,
    title: p.title,
    sizeBytes: sizeBytes ?? null,
    modifiedAt: modifiedAt ?? null,
    rawFilename,
    confidence,
    flags,
    firstSeenAt: now,
    lastSeenAt: now,
    missingSince: null,
  };
}

/** Themed trees: one level of `?dir=<Artist>` directories holding audio. */
async function crawlArtistTree(tree, baseUrl, now) {
  const tracks = [];
  const indexHtml = await get(baseUrl);
  if (!indexHtml) return tracks;

  let artists = parseListing(indexHtml, baseUrl).dirs;
  if (SAMPLE) artists = artists.slice(0, 3);
  console.log(`[${tree}] ${artists.length} artists`);

  for (const [i, artist] of artists.entries()) {
    const url = `${baseUrl}?dir=${encodeURIComponent(artist)}`;
    const html = await get(url);
    if (!html) continue;
    const { files } = parseListing(html, url);
    if (!files.length) {
      // Recorded, not ignored: an empty artist page is indistinguishable from
      // a successful one otherwise, and `errors.length === 0` would still
      // report the run as clean.
      errors.push({ url, message: 'listing parsed but contained no audio' });
    }
    for (const f of files) {
      const fileUrl = new URL(f.href, baseUrl).toString();
      tracks.push(
        makeTrack({
          tree,
          url: fileUrl,
          artistDir: artist,
          rawFilename: safeDecode(f.href.split('/').pop() ?? f.href),
          sizeBytes: f.sizeBytes,
          modifiedAt: f.modifiedAt,
          now,
        })
      );
    }
    if ((i + 1) % 25 === 0) console.log(`[${tree}] ${i + 1}/${artists.length}`);
  }
  return tracks;
}

/**
 * Day tree: /kirtan/ → year → month → files. Month names differ by era
 * ("April/" in 2008, "01/" in 2025) so directories are always ENUMERATED,
 * never constructed — constructing them is why /kirtan/2015/06/ came back empty.
 */
async function crawlDayTree(now) {
  const tracks = [];
  const rootHtml = await get(TREES.daywise);
  if (!rootHtml) return tracks;

  let years = parseListing(rootHtml, TREES.daywise).dirs.filter((d) =>
    /^\d{4}$/.test(d)
  );
  if (SAMPLE) years = years.slice(-2);
  console.log(`[daywise] ${years.length} years`);

  for (const year of years) {
    const yearUrl = `${ROOT}/kirtan/${year}/`;
    const yearHtml = await get(yearUrl);
    if (!yearHtml) continue;

    let months = parseListing(yearHtml, yearUrl).dirs;
    if (SAMPLE) months = months.slice(0, 1);

    for (const month of months) {
      const monthUrl = `${yearUrl}${encodeURIComponent(month)}/`;
      const html = await get(monthUrl);
      if (!html) continue;
      const { files } = parseListing(html, monthUrl);
      for (const f of files) {
        tracks.push(
          makeTrack({
            tree: 'daywise',
            url: new URL(f.href, monthUrl).toString(),
            artistDir: null,
            dir: `${year}/${month}`,
            rawFilename: safeDecode(f.href),
            sizeBytes: f.sizeBytes,
            modifiedAt: f.modifiedAt,
            now,
          })
        );
      }
    }
    console.log(`[daywise] ${year}: ${tracks.length} cumulative`);
  }
  return tracks;
}

async function main() {
  const startedAt = new Date().toISOString();
  await mkdir(OUT_DIR, { recursive: true });

  const tracks = [
    ...(await crawlArtistTree('ragiwise', TREES.ragiwise, startedAt)),
    ...(await crawlArtistTree('puratan', TREES.puratan, startedAt)),
    ...(await crawlDayTree(startedAt)),
  ];

  // A tree that contributed nothing is a failed crawl, not a small one.
  //
  // `crawlArtistTree` returns an empty array when the root listing fetch fails
  // — silently, before it logs its artist count — so a blocked or timed-out
  // tree looks exactly like a successful one from the outside. That happened:
  // a run on a GitHub runner lost ragiwise, which is 84% of the archive, wrote
  // a 7,960-track crawl as if it were complete, and the seeder applied it.
  //
  // The seeder's own MAX_DROP guard could not catch it either, because the
  // database was empty on first seed: there was no previous count to drop
  // from. So the refusal belongs here, before crawl.json is written — which
  // also leaves the last good crawl un-rotated and still on disk.
  const perTree = Object.fromEntries(
    Object.keys(TREES).map((t) => [t, tracks.filter((x) => x.tree === t).length])
  );
  console.log(
    `\ntracks by tree: ${Object.entries(perTree)
      .map(([t, n]) => `${t} ${n}`)
      .join(', ')}`
  );
  if (errors.length) {
    console.log(`${errors.length} error(s) during the crawl:`);
    for (const e of errors.slice(0, 10)) console.log(`  ${e.url} — ${e.message}`);
    if (errors.length > 10) console.log(`  …and ${errors.length - 10} more`);
  }

  const emptyTrees = Object.entries(perTree)
    .filter(([, n]) => n === 0)
    .map(([t]) => t);
  // Never on a sample: SAMPLE slices each tree to a couple of directories, so
  // an empty one means "the two I sampled had nothing", not "the tree is gone"
  // — and a sample writes crawl.sample.json, which the seeder refuses to load
  // anyway. Failing there would be a guard against a file that cannot reach
  // the database.
  if (emptyTrees.length && !ALLOW_PARTIAL && !SAMPLE) {
    console.error(
      `\nrefusing to write the crawl: ${emptyTrees.join(', ')} returned no ` +
        'tracks at all. SGPC blocks datacentre IPs intermittently, so a rerun ' +
        'is usually enough. Pass --allow-partial if a tree is genuinely gone ' +
        'and you mean to seed without it.'
    );
    process.exit(1);
  }

  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    requestCount,
    // Recorded in the file, not just implied by its name. A sample crawl is a
    // *successful* crawl, so nothing downstream can tell one apart by looking
    // at whether it parsed — the seeder refuses to load a file carrying this.
    sample: SAMPLE,
    tracks,
    errors,
  };

  // A sample never writes over the real crawl. A quick parser sanity-check
  // silently replaced a full 49,057-track crawl with 1,025 sample rows once
  // already, and the seeder then replaced the catalogue with 2% of it.
  const target = join(OUT_DIR, SAMPLE ? 'crawl.sample.json' : 'crawl.json');

  // Full runs keep the last good crawl one move from recoverable. Rotation
  // happens after the crawl succeeds, so a run that dies mid-flight leaves
  // both files untouched rather than shifting a good crawl into the backup
  // slot and writing nothing in its place.
  if (!SAMPLE) {
    const previous = join(OUT_DIR, 'crawl.previous.json');
    try {
      await access(target);
      await rename(target, previous);
      console.log(`→ previous crawl kept at ${previous}`);
    } catch {
      // First run, nothing to rotate.
    }
  }

  await writeFile(target, JSON.stringify(report, null, 2));
  console.log(
    `\ndone — ${tracks.length} tracks, ${requestCount} requests, ${errors.length} errors`
  );
  console.log(`→ ${target}`);
  if (SAMPLE) {
    console.log(
      'sample crawl — the seeder will refuse this file. Run without --sample to seed.'
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
