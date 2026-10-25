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

/**
 * How long past a segment's edge the tag page's strip stays on it.
 *
 * Hearing a cut means playing from it, and playing from an end cut runs
 * straight out of the segment: without the hold, the strip would let go of the
 * row in the very moment its edge is being judged.
 */
export const STRIP_HOLD_SECONDS = 15;

/**
 * The stretch of the recording the timeline spans when zoomed to one segment:
 * its saved edges plus half its length either side — at least `minPad`
 * seconds — kept inside the recording. Half the length, so a long cut still
 * has room for an edge to be pulled out. Saved edges, not the ones being
 * dragged, so the scale holds still mid-drag.
 */
export function zoomWindow(
  seg: Pick<TimelineSegment, 'start' | 'end'>,
  duration: number,
  minPad: number
): { start: number; end: number } {
  const pad = Math.max(minPad, (seg.end - seg.start) / 2);
  return { start: Math.max(0, seg.start - pad), end: Math.min(duration, seg.end + pad) };
}

/** What a cut being marked is shown first: most shabads here end inside 20 minutes. */
export const MARK_FIRST_SECONDS = 20 * 60;
/** How far the marking window grows once the playhead nears its end. */
export const MARK_STEP_SECONDS = 5 * 60;
/** How close to the window's end the playhead gets before it grows. */
const MARK_MARGIN_SECONDS = 60;

/**
 * The stretch of the recording the timeline spans while a cut is being
 * marked: `lead` seconds before its start, then 20 minutes, growing 5 at a
 * time once `reach` — the furthest the playhead has got — comes within a
 * minute of the end. Grown from the furthest point rather than the playhead
 * itself, so seeking back does not shrink the bar under the click.
 */
export function markingWindow(
  start: number,
  reach: number,
  duration: number,
  lead: number
): { start: number; end: number } {
  let end = start + MARK_FIRST_SECONDS;
  const short = reach + MARK_MARGIN_SECONDS - end;
  if (short > 0) end += Math.ceil(short / MARK_STEP_SECONDS) * MARK_STEP_SECONDS;
  return { start: Math.max(0, start - lead), end: Math.min(duration, end) };
}

/**
 * Which segment the strip under the timeline acts on, or null for the
 * untagged stretch the playhead is in.
 *
 * `held` is what the strip showed last, `pinned` a segment with unsaved edits:
 * those stay put wherever the playhead goes, or an edit would be saved against
 * whatever was playing. Otherwise the playhead decides — inside a segment
 * means that segment, and inside two means the held one if it is either, else
 * the one that starts later, the inner of a pair where one contains the other.
 * In a gap the held segment stays within the hold of its edges.
 */
export function stripSegment(
  segments: TimelineSegment[],
  position: number,
  held: string | null,
  pinned: string | null = null
): string | null {
  if (pinned && segments.some((s) => s.id === pinned)) return pinned;
  // Half-open: at exactly the end cut the playhead has left, so the hold
  // decides — and it keeps the segment whose end was just clicked.
  const under = segments.filter((s) => position >= s.start && position < s.end);
  if (under.length) {
    if (held && under.some((s) => s.id === held)) return held;
    return under.reduce((a, b) => (b.start > a.start ? b : a)).id;
  }
  const last = held ? segments.find((s) => s.id === held) : undefined;
  if (
    last &&
    position >= last.start - STRIP_HOLD_SECONDS &&
    position <= last.end + STRIP_HOLD_SECONDS
  ) {
    return last.id;
  }
  return null;
}

/**
 * The untagged stretch around a moment: from the last cut before it to the
 * next one after, or the recording's own ends. Unlike `untaggedGaps` it has no
 * minimum — the strip names whatever the playhead is in.
 */
export function gapAt(
  segments: TimelineSegment[],
  duration: number,
  position: number
): { start: number; end: number } {
  let start = 0;
  let end = duration;
  for (const s of segments) {
    if (s.end <= position) start = Math.max(start, s.end);
    if (s.start > position) end = Math.min(end, s.start);
  }
  return { start, end };
}
