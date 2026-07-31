/**
 * Filename → structured metadata.
 *
 * SGPC's filenames are the only metadata that exists, and they are inconsistent
 * in ways worth stating plainly, because every rule below exists for a real
 * observed case:
 *
 *   ragiwise  "Bhai Agyakar Singh (12.00pm to 1.10pm) 31-10-2025.mp3"   DD-MM-YYYY
 *             "Bhai Agyakar Singh (8.30pm to Smapti) 30-10-2025.mp3"    open-ended slot
 *             "Bhai Agaykar Singh (3.20pm to 4.20pm) 09-02-2025.mp3"    misspelt vs its own dir
 *   daywise   "(02;00 - 22;30 hours) 31 October2025.mp3"                DD MonthYYYY, ';' times
 *   puratan   "Ab mohe ram apna kar janya.mp3"                          title only, no date
 *
 * This module never resolves a conflict — it records both readings and flags
 * them. Picking a winner is the admin app's job, with a human looking at it.
 */
import type { TrackFlag } from '@kp/shared/types';

export interface ParsedFilename {
  artistInFilename: string | null;
  date: string | null;
  slotStartSec: number | null;
  slotEndSec: number | null;
  slotEndIsOpen: boolean;
  title: string | null;
  flags: TrackFlag[];
}

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

/** Formats that are catalogued but that no browser can play. */
const UNPLAYABLE = /\.(wma|wmv|ra|rm)$/i;

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * "12.00pm" | "1.10pm" | "8.30" | "02;00" → seconds from midnight.
 * Both '.' and ';' appear as the minute separator across the two trees.
 */
function toSeconds(raw: string): number | null {
  const m = raw
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})[.:;](\d{2})\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const mer = m[3];
  if (min > 59) return null;
  if (mer === 'pm' && h !== 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  // Without a meridiem the value is already 24h (daywise "02;00 - 22;30").
  if (h > 23) return null;
  return h * 3600 + min * 60;
}

/**
 * Some filenames on sgpc.net are percent-encoded twice, so a single decode
 * leaves literal "%20" in the text. Decode until it stops changing, then strip
 * the extension — which may itself be doubled (".MP3.mp3") — and the download
 * suffixes ("[1]") that crept in when files were re-uploaded.
 */
export function cleanName(rawFilename: string): string {
  let name = rawFilename;
  for (let i = 0; i < 3; i++) {
    let next: string;
    try {
      next = decodeURIComponent(name);
    } catch {
      break;
    }
    if (next === name) break;
    name = next;
  }
  return name
    .replace(/(\.(mp3|wma|m4a|aac|ogg|wav))+$/i, '')
    .replace(/\[\d+\]$/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseFilename(rawFilename: string): ParsedFilename {
  const flags: TrackFlag[] = [];
  const name = cleanName(rawFilename);

  if (UNPLAYABLE.test(rawFilename)) flags.push('unplayable-format');

  let date: string | null = null;
  let slotStartSec: number | null = null;
  let slotEndSec: number | null = null;
  let slotEndIsOpen = false;

  // --- date: DD-MM-YYYY (ragiwise) --------------------------------------
  const dmy = name.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dmy) date = iso(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));

  // --- date: "31 October2025" / "31 October 2025" (daywise) -------------
  if (!date) {
    const dMonY = name.match(/(\d{1,2})\s*([A-Za-z]+)\s*(\d{4})/);
    if (dMonY) {
      const mon = MONTHS[dMonY[2].toLowerCase()];
      if (mon) date = iso(Number(dMonY[3]), mon, Number(dMonY[1]));
    }
  }

  // --- time slot: "(12.00pm to 1.10pm)" | "(02;00 - 22;30 hours)" -------
  const slot = name.match(/\(([^)]+)\)/);
  if (slot) {
    const inner = slot[1].replace(/\bhours?\b/i, '').trim();
    const parts = inner.split(/\s*(?:to|-|–)\s*/i);
    if (parts.length >= 2) {
      slotStartSec = toSeconds(parts[0]);
      slotEndSec = toSeconds(parts[1]);
      // "8.30pm to Smapti" — the end is a word (end of the day's kirtan).
      if (slotStartSec !== null && slotEndSec === null) {
        slotEndIsOpen = true;
        flags.push('open-ended-slot');
      }
      // A pm-less start before a pm end is almost always pm too
      // ("1.10 to 2.20pm"); without this, afternoon sets land at 01:10.
      if (
        slotStartSec !== null &&
        slotEndSec !== null &&
        slotStartSec > slotEndSec &&
        /pm$/i.test(parts[1].trim())
      ) {
        slotStartSec += 12 * 3600;
      }
    }
  }

  // --- artist: text before the slot, for ragiwise ------------------------
  let artistInFilename: string | null = null;
  const beforeSlot = name.split('(')[0].trim();
  if (slot && beforeSlot) artistInFilename = beforeSlot.replace(/\s+/g, ' ');

  // --- title: puratan carries the shabad's first line and nothing else ---
  const title =
    !slot && !date ? name.replace(/\s+/g, ' ').trim() || null : null;

  if (!date) flags.push('no-date');
  if (slotStartSec === null) flags.push('no-slot');

  return {
    artistInFilename,
    date,
    slotStartSec,
    slotEndSec,
    slotEndIsOpen,
    title,
    flags,
  };
}

/**
 * Names differ by tree — ragiwise uses "Bhai Avtar Singh", puratan uses
 * "Avtar Singh" for what may be the same person, and filenames carry typos
 * ("Agaykar" vs "Agyakar"). Normalising for comparison only; the original
 * strings are always what gets stored.
 */
export function normaliseArtist(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(bhai|bibi|giani|ustad|prof\.?|dr\.?)\s+/g, '')
    .replace(/\s+ji$/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** True when the filename's artist disagrees with its directory. */
export function artistsDisagree(
  dir: string,
  inFilename: string | null
): boolean {
  if (!inFilename) return false;
  return normaliseArtist(dir) !== normaliseArtist(inFilename);
}
