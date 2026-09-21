/**
 * Tagging-workbench domain rules.
 *
 * Shared because the recordings shelves, the row badge and the tag page's
 * "mark fully tagged" offer all have to agree: two copies of this number is
 * two definitions of done, and the offer has to appear exactly where the
 * shelves would otherwise hold a recording hostage.
 */

/**
 * How much a recording may leave untagged and still count as done.
 *
 * Demanding zero would empty the Done shelf: recordings legitimately open with
 * an untagged minute of announcements and trail off into a couple of minutes
 * nobody needs to hear, and `untagged_seconds` itself leans on the filename's
 * slot length, which disagrees with the audio by minutes. Five minutes absorbs
 * both. Anything past it is a shabad-sized hole, which is work — the tag
 * page's own bar for a gap worth listing is 45 seconds.
 */
export const DONE_SLACK_SECONDS = 300;

/** A gap shorter than this is not worth offering as work. */
export const GAP_WORTH_LISTING_SECONDS = 45;

/**
 * Whether coverage alone still keeps this recording off the Done shelf.
 *
 * NULL `untagged_seconds` means the length is unknowable — no filename slot,
 * which is all of puratan — and unknown must read as "still open". The
 * alternative is a recording landing on Done because nobody can measure it.
 */
export function coverageOpen(untaggedSeconds: number | null | undefined): boolean {
  return untaggedSeconds == null || untaggedSeconds > DONE_SLACK_SECONDS;
}

/**
 * A span on the tag page's timeline.
 *
 * Deliberately not the `renditions` row shape: the axis only cares about a
 * span, a label and whether it is live, and keeping it to that lets the page
 * decide what "published" means without the component learning the enum.
 */
export interface TimelineSegment {
  id: string;
  start: number;
  end: number;
  name: string;
  published: boolean;
}

/**
 * Untagged stretches between segments, longest first.
 *
 * What the workbench actually hands a contributor: the holes, ordered by how
 * much listening each one is worth. Segments may arrive unsorted and may
 * overlap, so the sweep tracks the furthest end seen rather than the previous
 * segment's — otherwise an overlapping pair invents a negative gap.
 */
export function untaggedGaps(
  segments: TimelineSegment[],
  duration: number,
  minSeconds = GAP_WORTH_LISTING_SECONDS
): { start: number; end: number }[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const gaps: { start: number; end: number }[] = [];
  let cursor = 0;

  for (const segment of sorted) {
    if (segment.start - cursor >= minSeconds) {
      gaps.push({ start: cursor, end: segment.start });
    }
    cursor = Math.max(cursor, segment.end);
  }

  if (duration - cursor >= minSeconds) gaps.push({ start: cursor, end: duration });

  return gaps.sort((a, b) => b.end - b.start - (a.end - a.start));
}

/** Seconds of a recording no segment covers. Overlaps counted once. */
export function untaggedSeconds(segments: TimelineSegment[], duration: number): number {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  let covered = 0;
  let cursor = 0;

  for (const segment of sorted) {
    const start = Math.max(segment.start, cursor);
    if (segment.end > start) {
      covered += segment.end - start;
      cursor = segment.end;
    }
  }

  return Math.max(0, duration - covered);
}

/**
 * Segments this range would overlap.
 *
 * The database does not forbid overlap, and it should not — a rendition can
 * legitimately contain another, and re-cutting boundaries means transient
 * overlap is normal. But an *accidental* overlap is the common mistake when
 * marking a boundary by ear, so the workbench warns rather than the schema
 * refusing.
 *
 * `ignoreId` is the segment being edited, which always overlaps itself.
 */
export function overlapping(
  segments: TimelineSegment[],
  range: { start: number; end: number },
  ignoreId?: string
): TimelineSegment[] {
  return segments.filter((s) => s.id !== ignoreId && s.start < range.end && range.start < s.end);
}
