/**
 * Coverage report over a crawl.json.
 *
 * The point of this is to size the work before any schema or UI exists:
 * how much of the archive is actually playable, how much has artist+date
 * attribution already, and — the number that matters most — how many days
 * have a ragiwise set versus only a 563MB day-file blob. That ratio is the
 * tagging workload.
 *
 *   node --experimental-strip-types src/report.ts
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../out');

/**
 * Recomputed here rather than trusted from the crawl, so the rule can change
 * without re-fetching 670 pages from sgpc.net. Artist/filename disagreement is
 * deliberately not part of it — the directory is the artist of record.
 */
function confidence(flags: string[]): 'high' | 'medium' | 'low' {
  const parseFlags = flags.filter((f) => f !== 'artist-mismatch');
  if (parseFlags.includes('no-date')) return 'low';
  return parseFlags.length ? 'medium' : 'high';
}

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');
const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`;

function tally<T>(xs: T[], key: (x: T) => string | null) {
  const m = new Map<string, number>();
  for (const x of xs) {
    const k = key(x);
    if (k === null) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

const report = JSON.parse(await readFile(join(OUT, 'crawl.json'), 'utf8'));
const tracks = report.tracks as any[];
const by = (t: string) => tracks.filter((x) => x.tree === t);

const ragiwise = by('ragiwise');
const puratan = by('puratan');
const daywise = by('daywise');

console.log('='.repeat(64));
console.log('KIRTAN ARCHIVE — COVERAGE REPORT');
console.log('='.repeat(64));
console.log(
  `crawled ${report.startedAt} → ${report.finishedAt}` +
    `  |  ${report.requestCount} requests, ${report.errors.length} errors\n`
);

// ── totals ───────────────────────────────────────────────────────────────
const unplayable = tracks.filter((t) => t.flags.includes('unplayable-format'));
console.log('TOTALS');
console.log(`  tracks            ${tracks.length}`);
console.log(`    ragiwise        ${ragiwise.length}   (browsable catalogue)`);
console.log(`    puratan         ${puratan.length}   (one shabad per track)`);
console.log(`    daywise         ${daywise.length}   (indexed, not surfaced)`);
console.log(
  `  unplayable        ${unplayable.length}  ${pct(unplayable.length, tracks.length)}  (.wma etc)`
);
const sized = tracks.filter((t) => t.sizeBytes);
if (sized.length) {
  const total = sized.reduce((a, t) => a + t.sizeBytes, 0);
  console.log(`  sized files       ${sized.length} totalling ${gb(total)}`);
}

// ── parse quality ────────────────────────────────────────────────────────
console.log('\nPARSE QUALITY');
const conf = tally(tracks, (t) => confidence(t.flags));
for (const k of ['high', 'medium', 'low']) {
  console.log(`  ${k.padEnd(16)}${String(conf.get(k) ?? 0).padStart(6)}  ${pct(conf.get(k) ?? 0, tracks.length)}`);
}
const flagCounts = tally(tracks, () => null);
const allFlags = new Map<string, number>();
for (const t of tracks) for (const f of t.flags) allFlags.set(f, (allFlags.get(f) ?? 0) + 1);
for (const [f, n] of [...allFlags].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${f.padEnd(16)}${String(n).padStart(6)}  ${pct(n, tracks.length)}`);
}

// ── artists ──────────────────────────────────────────────────────────────
console.log('\nARTISTS');
const rArtists = tally(ragiwise, (t) => t.artistDir);
const pArtists = tally(puratan, (t) => t.artistDir);
console.log(`  ragiwise          ${rArtists.size}`);
console.log(`  puratan           ${pArtists.size}  (separate roster, no "Bhai " prefix)`);
console.log('  top 10 by track count:');
for (const [a, n] of [...rArtists].sort((x, y) => y[1] - x[1]).slice(0, 10)) {
  console.log(`    ${String(n).padStart(5)}  ${a}`);
}

// ── year coverage ────────────────────────────────────────────────────────
console.log('\nCOVERAGE BY YEAR  (ragiwise = taggable / daywise = blob only)');
const years = new Set<string>();
const rYear = tally(ragiwise, (t) => t.date?.slice(0, 4) ?? null);
const dYear = tally(daywise, (t) => t.date?.slice(0, 4) ?? null);
for (const y of [...rYear.keys(), ...dYear.keys()]) years.add(y);
console.log('  year    ragiwise   daywise');
for (const y of [...years].sort()) {
  console.log(
    `  ${y}  ${String(rYear.get(y) ?? 0).padStart(9)}  ${String(dYear.get(y) ?? 0).padStart(8)}`
  );
}

// ── the number that sizes the tagging effort ─────────────────────────────
const rDays = new Set(ragiwise.map((t) => t.date).filter(Boolean));
const dDays = new Set(daywise.map((t) => t.date).filter(Boolean));
const covered = [...dDays].filter((d) => rDays.has(d)).length;
console.log('\nTAGGING WORKLOAD');
console.log(`  days with a ragiwise set     ${rDays.size}`);
console.log(`  days with only a day-file    ${dDays.size - covered}`);
console.log(
  `  day-files already covered    ${covered}  ${pct(covered, dDays.size)}` +
    `  ← these need no blob segmenting`
);
console.log(
  `\n  puratan auto-taggable        ${puratan.filter((t) => t.title).length}` +
    `  (title → BaniDB match, no human)`
);
console.log('='.repeat(64));
