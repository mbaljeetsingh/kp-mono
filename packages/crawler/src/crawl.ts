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
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseListing } from './listings.ts';
import { parseFilename, artistsDisagree } from './parse-filename.ts';

const ROOT = 'https://sgpc.net';
const TREES = {
  ragiwise: `${ROOT}/ragiwise/`,
  puratan: `${ROOT}/puratanlkirtan/`,
  daywise: `${ROOT}/kirtan/`,
} as const;

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../out');
const RATE_MS = 1000;
const SAMPLE = process.argv.includes('--sample');

const UA =
  'kirtan-player-crawler/0.1 (archive indexer; contact: baljeet@underlings.com)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha1 = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);

/**
 * Track identity must NOT be derived from the URL.
 *
 * Segments are the asset here — hours of human tagging — and they point at a
 * track. SGPC has already reorganised this archive once (the entire previous
 * site 404'd). If a file moves or is renamed, a URL-keyed id changes and every
 * segment attached to it orphans silently.
 *
 * So identity is the content's natural key — who, when, which slot — which
 * survives a path change. The URL is stored as a mutable attribute that a
 * re-crawl is free to update in place.
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

let requestCount = 0;
const errors = [];

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
}) {
  const p = parseFilename(rawFilename);
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
    }),
    /** Changes when SGPC moves a file; never used as a key. */
    urlId: sha1(url),
    tree,
    url,
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
    for (const f of files) {
      const fileUrl = new URL(f.href, baseUrl).toString();
      tracks.push(
        makeTrack({
          tree,
          url: fileUrl,
          artistDir: artist,
          rawFilename: decodeURIComponent(f.href.split('/').pop() ?? f.href),
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
            rawFilename: decodeURIComponent(f.href),
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

  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    requestCount,
    tracks,
    errors,
  };
  await writeFile(join(OUT_DIR, 'crawl.json'), JSON.stringify(report, null, 2));
  console.log(
    `\ndone — ${tracks.length} tracks, ${requestCount} requests, ${errors.length} errors`
  );
  console.log(`→ ${join(OUT_DIR, 'crawl.json')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
