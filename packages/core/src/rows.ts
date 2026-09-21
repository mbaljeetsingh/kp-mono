/**
 * Database row → `Playable`.
 *
 * Pure and framework-free, so the web player, the mobile app and the admin
 * workbench all read a rendition the same way. Every surface that plays audio
 * goes through here, which is why it is worth being strict about the shape.
 */
import type { LineTiming, Playable } from './types';

/**
 * The columns the player needs from a rendition row.
 *
 * Widened deliberately — the view carries more than this, and callers should
 * not have to model columns they never read.
 */
export interface RenditionRow {
  id: string;
  name: string;
  url: string;
  artist?: string | null;
  artist_display?: string | null;
  artist_photo?: string | null;
  raag?: string | null;
  shabad_id?: number | null;
  main_verse_id?: number | null;
  line_timings?: unknown;
  start_sec?: number | string | null;
  end_sec?: number | string | null;
}

/**
 * Seconds from a column that may be null, absent, or a numeric string.
 *
 * Returns `undefined` rather than a number for an untagged recording, because
 * `Playable.startSec`/`endSec` mean "this is a segment" by their presence. The
 * Vue original ran every row through `Number()`, which turns an absent column
 * into `NaN` — and `NaN` is neither null nor undefined, so it survives every
 * `??` fallback downstream and poisons the segment arithmetic silently.
 */
function seconds(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Timings are an array or nothing. The guard covers null, a view that predates
 * the column, and a payload that came back as a string, in one test — which is
 * also the test the lyrics panel uses to decide whether a rendition is aligned.
 */
function timings(value: unknown): LineTiming[] | null {
  return Array.isArray(value) ? (value as LineTiming[]) : null;
}

export function toPlayable(row: RenditionRow): Playable {
  return {
    id: row.id,
    title: row.name,
    subtitle: row.artist_display ?? row.artist ?? undefined,
    artist: row.artist ?? undefined,
    raag: row.raag ?? null,
    artistPhoto: row.artist_photo ?? null,
    shabadId: row.shabad_id ?? null,
    mainVerseId: row.main_verse_id ?? null,
    lineTimings: timings(row.line_timings),
    url: row.url,
    startSec: seconds(row.start_sec),
    endSec: seconds(row.end_sec),
  };
}
