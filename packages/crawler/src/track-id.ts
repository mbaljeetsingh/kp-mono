/**
 * Track identity. One definition, imported by both the crawler and the seeder.
 *
 * It lived in both files before, and they drifted: the crawler disambiguated
 * undated daywise files by their month directory while the seeder's copy did
 * not even accept that argument. Since the seeder recomputes ids and its values
 * are the ones that land, the crawler's fix never took effect — two identically
 * named undated recordings in different months collided, and the seeder's dedup
 * dropped one as a "duplicate SGPC lists twice". Hence one module: these two
 * callers must agree, and the only way to guarantee that is to have one copy.
 *
 * Identity must NOT be derived from the URL.
 *
 * Renditions are the asset here — hours of human tagging — and they point at a
 * track. SGPC has already reorganised this archive once (the entire previous
 * site 404'd). If a file moves, a URL-keyed id changes and every rendition
 * attached to it is stranded on a row nothing links to any more.
 *
 * So identity is the listing metadata's natural key — who, when, which slot —
 * which survives a path change. The URL is a mutable attribute a re-crawl
 * updates in place.
 *
 * What this does and does not survive, measured rather than assumed:
 *
 *   | tree             | survives a path move | survives a rename |
 *   |------------------|----------------------|-------------------|
 *   | ragiwise         | yes                  | no  (filename)    |
 *   | puratan          | yes                  | no  (title)       |
 *   | daywise, dated   | yes                  | yes               |
 *   | daywise, undated | yes                  | no  (filename)    |
 *
 * Only dated daywise files are durable against a rename. Closing that gap is a
 * reconciliation problem, not a hashing one — matching a renamed file on its
 * unchanged (size, mtime) — and is tracked separately in #26.
 */
import { createHash } from 'node:crypto';
import type { SourceTree } from '@kp/shared/types';

export interface TrackIdParts {
  tree: SourceTree;
  artistDir?: string | null;
  date?: string | null;
  slotStartSec?: number | null;
  title?: string | null;
  rawFilename: string;
  /** Daywise only: the year/month directory the file was listed under, e.g. `2025/01`. */
  dir?: string | null;
}

export const sha1 = (s: string): string =>
  createHash('sha1').update(s).digest('hex').slice(0, 16);

export function stableId({
  tree,
  artistDir,
  date,
  slotStartSec,
  title,
  rawFilename,
  dir,
}: TrackIdParts): string {
  const parts =
    tree === 'daywise'
      ? // `dir` disambiguates undated files: two identically-named recordings
        // in different month directories would otherwise share an id, and the
        // seeder's dedup would silently drop one as a duplicate.
        [
          tree,
          date ?? `${dir ?? ''}/${rawFilename}`,
          String(slotStartSec ?? ''),
        ]
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
