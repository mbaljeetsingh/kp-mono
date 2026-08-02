/**
 * Artist roster and photos from kirtan.sgpc.net.
 *
 * SGPC publishes a photo for every one of its 204 ragis, embedded as JSON in
 * `cards.php`. They cannot be hotlinked: the images are referer-protected, so
 * an `<img src>` pointing at them from our origin gets a 403 while the same
 * URL with no referer returns the file. Measured:
 *
 *   no referer                  -> 200 image/png
 *   Referer: kirtan.sgpc.net    -> 200
 *   Referer: <our origin>       -> 403
 *
 * A server-side fetch sends no referer, which is why this belongs in the
 * crawler rather than in either app. The whole set is ~204 files at roughly
 * 28 KB — about 6 MB, fetched once and re-checked on each crawl.
 *
 *   node --experimental-strip-types src/crawl-artists.ts
 */
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROSTER = 'https://kirtan.sgpc.net/cards.php?_spa=1';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../out');
const PHOTOS = join(OUT, 'artist-photos');
const RATE_MS = 400;

// A browser UA is required: the roster endpoint 403s on the default one.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Filenames come from SGPC and are used verbatim as storage keys, so anything
 *  that could escape the directory has to go. */
const safeName = (name) => name.replace(/[^\w \-.]/g, '_').trim();

async function fetchRoster() {
  const res = await fetch(ROSTER, {
    headers: { 'user-agent': UA },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`roster: HTTP ${res.status}`);
  const body = await res.text();
  // The response is a JSON envelope whose `html` holds a script tag with the
  // roster array inline; the entries are matched directly rather than trying
  // to parse the surrounding page.
  const html = JSON.parse(body.replace(/^﻿/, '')).html as string;

  const artists: { name: string; img: string }[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(
    /"name":"([^"]+)","url":"[^"]*","img":"([^"]+)"/g
  )) {
    const name = m[1]!;
    const img = m[2]!.replace(/\\\//g, '/');
    if (seen.has(name)) continue;
    seen.add(name);
    artists.push({ name, img });
  }
  return artists;
}

async function main() {
  await mkdir(PHOTOS, { recursive: true });
  const artists = await fetchRoster();
  console.log(`roster: ${artists.length} artists`);

  const manifest: { name: string; file: string; bytes: number }[] = [];
  const errors: { name: string; message: string }[] = [];

  for (const [i, a] of artists.entries()) {
    const file = `${safeName(a.name)}.png`;
    const path = join(PHOTOS, file);

    // Skip what is already on disk: the photos change far less often than the
    // recordings, so a re-crawl should not re-download 6 MB every time.
    //
    // The cost of that cache is that a photo SGPC *replaces* is never picked up
    // on a machine holding the old file — a new ragi appears (the roster is
    // re-read every run) but a new portrait of an existing one does not. On an
    // ephemeral runner the disk is empty anyway, so a scheduled crawl refreshes
    // everything for free; set REFRESH_PHOTOS=1 to force the same on a box with
    // a persistent out/ directory.
    if (!process.env.REFRESH_PHOTOS) {
      try {
        const existing = await stat(path);
        if (existing.size > 0) {
          manifest.push({ name: a.name, file, bytes: existing.size });
          continue;
        }
      } catch {
        // Not cached yet — fall through and fetch.
      }
    }

    await sleep(RATE_MS);
    try {
      // No referer header, deliberately: sending one is what triggers the 403.
      const res = await fetch(a.img, {
        headers: { 'user-agent': UA },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(path, buf);
      manifest.push({ name: a.name, file, bytes: buf.length });
    } catch (err) {
      errors.push({ name: a.name, message: String(err?.message ?? err) });
    }
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${artists.length}`);
  }

  await writeFile(
    join(OUT, 'artists.json'),
    JSON.stringify(
      { fetchedAt: new Date().toISOString(), manifest, errors },
      null,
      2
    )
  );

  const total = manifest.reduce((sum, m) => sum + m.bytes, 0);
  console.log(
    `\ndone — ${manifest.length} photos (${(total / 1024 / 1024).toFixed(1)} MB), ` +
      `${errors.length} failed`
  );
  if (errors.length) console.log('  first failure:', errors[0]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
