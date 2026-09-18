/**
 * Segment arithmetic.
 *
 * A tagged shabad is not a file — it is a byte range of one, and sgpc.net
 * serves `206` with `accept-ranges: bytes`, so seeking into a 70-minute set
 * costs nothing and downloads nothing extra. Every function here exists
 * because the player's clock runs on the *file's* timeline while the listener
 * is watching the *shabad's*.
 *
 * No off-the-shelf player models this: they all assume one track is one URL.
 */
import type { Playable } from './types';

/** Where the shabad begins in the file. Whole-file playback starts at zero. */
export function segmentStart(item: Playable | null): number {
  return item?.startSec ?? 0;
}

/**
 * Where the shabad ends in the file, falling back to the file's own duration
 * when nothing is tagged. `duration` is passed in because only the player
 * knows it, and this module deliberately knows no player.
 */
export function segmentEnd(item: Playable | null, duration: number): number {
  return item?.endSec ?? duration;
}

/**
 * Elapsed within the shabad, not within the file it sits inside — a segment
 * starting at 42:10 of a set should read 0:00, not 42:10.
 */
export function elapsedIn(item: Playable | null, position: number): number {
  return Math.max(0, position - segmentStart(item));
}

/** Length of the segment — of the file, when nothing is tagged. */
export function segmentTotal(item: Playable | null, duration: number): number {
  if (item?.endSec != null && item.startSec != null) {
    return item.endSec - item.startSec;
  }
  return duration;
}

/**
 * Position as a percentage of the segment, clamped.
 *
 * Clamped because a long file after a short one keeps the old duration as the
 * denominator until its metadata lands, and a resumed position then divides
 * out well past 100. A scrubber survives that, but a bare percentage width
 * draws a progress line several screens wide and leaves the page pannable
 * sideways.
 */
export function progressPct(
  item: Playable | null,
  position: number,
  duration: number
): number {
  const start = segmentStart(item);
  const end = segmentEnd(item, duration);
  if (!end || end <= start) return 0;
  const pct = ((position - start) / (end - start)) * 100;
  return Math.min(100, Math.max(0, pct));
}

/**
 * Absolute seek target for a percentage of the segment — what a scrubber has,
 * given it knows its own width and nothing about the file underneath.
 *
 * Lands just short of the end: exactly on it trips `hasReachedEnd`, so
 * dragging to the far right of a scrubber would skip the shabad rather than
 * park at the end of it.
 */
export function seekTargetForPct(
  item: Playable | null,
  pct: number,
  duration: number
): number {
  const start = segmentStart(item);
  const end = segmentEnd(item, duration);
  const to = start + ((end - start) * pct) / 100;
  return Number.isFinite(end) && end > start ? Math.min(to, end - 0.5) : to;
}

/**
 * Has playback run past the segment's end?
 *
 * A segment's end is not the file's end, so waiting for a native `ended` event
 * would mean waiting up to an hour. The player polls position instead and
 * advances the queue itself.
 */
export function hasReachedEnd(item: Playable | null, position: number): boolean {
  const end = item?.endSec;
  return end != null && position >= end;
}

/**
 * Should this position be remembered for next time?
 *
 * Only whole-file playback has a resume position. A segment always starts at
 * its own offset, and a live stream has no meaningful position at all —
 * writing one made a later "listen live" seek to a stale timestamp.
 *
 * Near-start and near-end positions are dropped too: resuming a track the
 * listener effectively finished is worse than starting it over.
 */
export function shouldRememberResume(
  item: Playable | null,
  position: number,
  duration: number
): boolean {
  if (!item || item.isLive || item.startSec !== undefined) return false;
  if (position < 30) return false;
  if (duration && position > duration - 30) return false;
  return true;
}

/** Where playback should begin: the segment's own start, else a saved resume. */
export function startPositionFor(
  item: Playable | null,
  resume?: number
): number {
  return item?.startSec ?? resume ?? 0;
}
