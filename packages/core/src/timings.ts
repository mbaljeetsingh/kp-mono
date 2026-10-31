/**
 * Read-along lookup.
 *
 * Timings are sparse on purpose — a gap is alaap, instrumental or katha, where
 * nothing is being sung — so "no line at this moment" is a correct answer, not
 * a missing one.
 */
import { segmentStart, segmentTotal } from './segment';
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

/**
 * Closest two scrubber marks may sit, in percent of the bar. A refrain sung
 * quickly can start lines a second apart, and on a long rendition those would
 * draw as one thick smear rather than two marks anybody could aim at.
 */
const MIN_MARK_GAP_PCT = 1;

/**
 * Where each sung line starts along the scrubber, in percent of the segment.
 *
 * Counts timed lines, not verses: a refrain returns, and each return is a place
 * somebody may want to go back to. Empty when there is nothing to mark, so an
 * unaligned rendition keeps a plain bar.
 */
export function lineMarkPcts(item: Playable | null, duration: number): number[] {
  const total = segmentTotal(item, duration);
  if (!item?.lineTimings?.length || !(total > 0)) return [];

  const start = segmentStart(item);
  const marks: number[] = [];
  for (const line of [...item.lineTimings].sort((a, b) => a.start - b.start)) {
    const pct = ((line.start - start) / total) * 100;
    if (pct < 0 || pct > 100) continue;
    const last = marks[marks.length - 1];
    if (last === undefined || pct - last >= MIN_MARK_GAP_PCT) marks.push(pct);
  }
  return marks;
}

/** Does this rendition follow the singing, or just hold the tagged line? */
export function isAligned(item: Playable | null): boolean {
  return (item?.lineTimings?.length ?? 0) > 0;
}
