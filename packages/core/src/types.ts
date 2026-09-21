/**
 * The playback model, with no player in it.
 *
 * Everything here is plain data and plain functions. The web player drives an
 * `<audio>` element and the mobile app drives expo-audio; neither difference
 * reaches this far, which is the point — the segment arithmetic below is the
 * part that took real work and it should exist once.
 */

/**
 * One sung line of a rendition, as the aligner wrote it into `line_timings`.
 *
 * `start`/`end` are absolute seconds into the file — the same clock as the
 * player's position, `startSec` and `endSec` — deliberately, so that re-cutting
 * a segment's boundaries does not invalidate an alignment that cost real work.
 *
 * Snake case because this is the jsonb payload verbatim, not a set of columns
 * anything maps.
 */
export interface LineTiming {
  verse_id: number;
  start: number;
  end: number;
}

export interface Playable {
  /** Stable track id — never the URL, which changes when SGPC reorganises. */
  id: string;
  title: string;
  subtitle?: string;
  /** Kept separate from `subtitle` so the player bar can link to the artist. */
  artist?: string;
  /** Carried so Up next can suggest by raag when the queue runs dry. */
  raag?: string | null;
  /** Storage filename for the artist's photo, when SGPC published one. */
  artistPhoto?: string | null;
  /** BaniDB ids, when the segment has been linked — drives read-along. */
  shabadId?: number | null;
  mainVerseId?: number | null;
  /**
   * Per-line timings, sorted by `start`, when this rendition has been aligned
   * — null for the rest, which is most of the archive. Sparse on purpose: a
   * gap between entries is alaap, instrumental or katha, where nothing is
   * being sung and so nothing should be highlighted.
   */
  lineTimings?: LineTiming[] | null;
  url: string;
  /** Set for a tagged segment; omitted to play the whole file. */
  startSec?: number;
  endSec?: number;
  /**
   * A broadcast rather than a recording. A flag rather than an id comparison
   * because there are forty stations now and every control that treats live
   * differently — no scrubber, no skip, no resume position, no play count —
   * has to key off something the row mapper can never accidentally set.
   */
  isLive?: boolean;
}
