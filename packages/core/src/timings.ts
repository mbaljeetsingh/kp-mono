/**
 * Read-along lookup.
 *
 * Timings are sparse on purpose — a gap is alaap, instrumental or katha, where
 * nothing is being sung — so "no line at this moment" is a correct answer, not
 * a missing one.
 */
import type { LineTiming, Playable } from './types';

/** The line being sung at `position`, or null in a gap. */
export function lineAt(
  timings: LineTiming[] | null | undefined,
  position: number
): LineTiming | null {
  return timings?.find((l) => position >= l.start && position < l.end) ?? null;
}

/**
 * Which verse the lyrics panel should light.
 *
 * Aligned renditions follow the singing; everything else — most of the archive
 * — keeps holding the one line the tagger pinned.
 */
export function highlightVerseId(item: Playable | null, position: number): number | null {
  const timings = item?.lineTimings;
  if (!timings?.length) return item?.mainVerseId ?? null;
  return lineAt(timings, position)?.verse_id ?? null;
}

/** Does this rendition follow the singing, or just hold the tagged line? */
export function isAligned(item: Playable | null): boolean {
  return (item?.lineTimings?.length ?? 0) > 0;
}
