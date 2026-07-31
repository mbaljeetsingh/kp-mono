/**
 * Shared types for the kirtan archive.
 *
 * Three source trees, deliberately kept distinct — they have different naming
 * conventions, different artist rosters, and different roles in the product:
 *
 *   ragiwise — 70-min sets, artist + date + time slot in the filename.
 *              The day-one browsable catalog. Skews heavily recent.
 *   puratan  — one shabad per track, titled with the shabad's first line.
 *              Separate artist roster (no "Bhai " prefix). Auto-taggable.
 *   daywise  — 20-hour, ~563MB whole-day recordings back to 2006.
 *              Indexed but NOT surfaced as a browse tier: historical record
 *              and source material for segmenting where ragiwise has no cover.
 */

export type SourceTree = 'ragiwise' | 'puratan' | 'daywise';

/** A file as it exists on sgpc.net. One row per URL. */
export interface Track {
  /** Stable id: sha1 of `url`. */
  id: string;
  tree: SourceTree;
  url: string;

  /**
   * Artist of record — the *directory* name, not the filename. SGPC's
   * filenames are misspelled and misfiled often enough that the directory is
   * the more reliable signal (e.g. a "Bhai Agyapal Singh" file sits inside
   * Bhai Agyakar Singh's directory).
   */
  artistDir: string | null;
  /** Artist as parsed from the filename, when it disagrees with artistDir. */
  artistInFilename: string | null;

  /** Recording date, ISO `YYYY-MM-DD`. Null when unparseable. */
  date: string | null;
  /** Seconds from midnight; slot start/end from `(12.00pm to 1.10pm)`. */
  slotStartSec: number | null;
  slotEndSec: number | null;
  /** True when the slot ends at a word rather than a time (e.g. "to Smapti"). */
  slotEndIsOpen: boolean;

  /** Shabad first line, for puratan where the title carries it. */
  title: string | null;

  /** Bytes. From the autoindex size column or a HEAD; null when unknown. */
  sizeBytes: number | null;
  /** Server mtime from the autoindex listing, ISO. */
  modifiedAt: string | null;

  /** Always kept — every downstream fix needs the original string. */
  rawFilename: string;
  /** Parse confidence; anything below `high` is admin-review fodder. */
  confidence: 'high' | 'medium' | 'low';
  /** Machine-readable reasons the parse was imperfect. */
  flags: TrackFlag[];

  /** Crawl bookkeeping — lets a nightly full re-crawl double as change detection. */
  firstSeenAt: string;
  lastSeenAt: string;
  missingSince: string | null;
}

export type TrackFlag =
  | 'no-date'
  | 'no-slot'
  | 'open-ended-slot'
  | 'artist-mismatch'
  | 'unplayable-format'
  | 'duplicate-candidate';

/**
 * A tagged region of a Track. This is the actual product unit: search returns
 * segments, the player plays segments. Costs one row — Range requests do the
 * seeking, so nothing is re-encoded, downloaded, or stored.
 */
export interface Segment {
  id: string;
  trackId: string;
  startSec: number;
  endSec: number;

  /** BaniDB shabad id. Null until a tagger (or the puratan matcher) sets it. */
  shabadId: number | null;
  /** Denormalised first line, so search works before BaniDB is joined. */
  firstLine: string | null;
  raag: string | null;
  taal: string | null;

  /** Pipeline state — the public app only ever reads `published`. */
  status: SegmentStatus;
  /** How the boundary was produced; `silence-detect` rows need human review. */
  source: 'manual' | 'silence-detect' | 'duty-roster' | 'puratan-title';
  createdBy: string | null;
}

export type SegmentStatus =
  | 'draft'
  | 'segmented'
  | 'shabad-linked'
  | 'music-tagged'
  | 'reviewed'
  | 'published';

/** Output of a crawl run — written to disk, then upserted into Postgres. */
export interface CrawlReport {
  startedAt: string;
  finishedAt: string;
  requestCount: number;
  tracks: Track[];
  errors: { url: string; message: string }[];
}
