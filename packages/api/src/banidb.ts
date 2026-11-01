/**
 * BaniDB search.
 *
 * Shared by the tagging workbench, where it links a shabad to a rendition, and
 * by the player's read-along, where a listener on a live broadcast can look up
 * what they are hearing for themselves.
 */
import type { TitleScript } from '@kp/core';
import { useQuery } from '@tanstack/react-query';

/**
 * The workbench's choice, for lack of a header language there. `searchtype` 0
 * is BaniDB's first-letter search from the start of a line, in Gurmukhi or the
 * GurbaniLipi keys that map onto it; 7 is first letters of the romanized line,
 * anywhere in it. Neither searches the translation: `peace` finds nothing on 7.
 * Punjabi is the default because that is how kirtan is looked up — you hear a
 * line and type its initials.
 */
export const SEARCH_TYPES = [
  { key: 0, label: 'Punjabi' },
  { key: 7, label: 'Roman letters' },
] as const;

/**
 * What a listener's language searches. First letters anywhere in a line, both
 * ways: 1 takes Gurmukhi or GurbaniLipi keys, 7 roman letters. Anywhere, because
 * the line somebody hears is rarely the one a verse starts with.
 */
export const LANGUAGE_SEARCH_TYPE: Record<TitleScript, number> = { en: 7, pa: 1 };

/**
 * The read-along's search, which shows twelve lines in shabad order. Punjabi
 * stays with the start of a line there: searched anywhere, a few letters can fill
 * all twelve before the line that actually starts with them.
 */
export const READ_ALONG_SEARCH_TYPE: Record<TitleScript, number> = { en: 7, pa: 0 };

/**
 * Below this, initials match too much of Gurbani to be worth asking: `jj` is
 * 4,304 lines, `jja` 205.
 */
export const MIN_FIRST_LETTERS = 3;

/**
 * As many hits as one search reads. `jja` is about 190 shabads at this size, and
 * the ids travel in a query string, whose limit `shabadsByIds` gives as about 250.
 */
const MAX_SHABAD_HITS = 200;

/**
 * Long enough for BaniDB's slower answers (two to three seconds for 200 hits),
 * short enough that its stalls do not hold up the titles and ragis waiting on it.
 */
const SHABAD_IDS_TIMEOUT_MS = 6000;

export interface BaniDbHit {
  shabadId: number;
  verseId: number;
  verse?: { unicode?: string; gurmukhi?: string };
  transliteration?: { english?: string };
  translation?: { en?: { bdb?: string } };
  source?: { english?: string };
  writer?: { english?: string };
  raag?: { english?: string };
}

export async function searchBaniDb(
  base: string,
  term: string,
  searchType: number
): Promise<BaniDbHit[]> {
  const res = await fetch(`${base}/search/${encodeURIComponent(term)}?searchtype=${searchType}`);
  if (!res.ok) throw new Error(`BaniDB returned ${res.status}`);
  const json = (await res.json()) as { verses?: BaniDbHit[] };
  // Twelve is enough to recognise the line without turning the panel into a
  // second list to read.
  return (json.verses ?? []).slice(0, 12);
}

export interface ShabadIdMatches {
  ids: number[];
  /** BaniDB held more lines than one search reads, so a recording may be missing. */
  partial: boolean;
}

/** The shabads with a line matching these letters, for joining to the archive. */
export async function shabadIdsMatching(
  base: string,
  term: string,
  searchType: number
): Promise<ShabadIdMatches> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHABAD_IDS_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${base}/search/${encodeURIComponent(term)}?searchtype=${searchType}&results=${MAX_SHABAD_HITS}`,
      { signal: controller.signal }
    );
    if (!res.ok) throw new Error(`BaniDB returned ${res.status}`);
    const json = (await res.json()) as {
      verses?: BaniDbHit[];
      resultsInfo?: { totalResults?: number };
    };
    const verses = json.verses ?? [];
    return {
      ids: [...new Set(verses.map((hit) => hit.shabadId))],
      partial: (json.resultsInfo?.totalResults ?? 0) > verses.length,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function useBaniDbSearch(base: string, term: string, searchType: number) {
  const trimmed = term.trim();
  return useQuery({
    queryKey: ['banidb', 'search', searchType, trimmed],
    queryFn: () => searchBaniDb(base, trimmed, searchType),
    // One or two characters match most of the corpus, which is a slow request
    // for a result nobody wanted.
    enabled: trimmed.length >= 2,
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });
}

export const GURMUKHI_BACKSPACE = '⇐';

/**
 * The GurbaniLipi keys of the on-screen keyboards, ten to a row, as np-mono's
 * tested one lays them out. Blanks hold the grid's shape: the rows follow how the
 * letters group, so the last is short and the gap is part of the layout.
 */
export const GURMUKHI_KEYS: readonly string[] = [
  'a',
  'A',
  'e',
  's',
  'h',
  'q',
  'Q',
  'd',
  'D',
  'n',
  'k',
  'K',
  'g',
  'G',
  '|',
  'p',
  'P',
  'b',
  'B',
  'm',
  'c',
  'C',
  'j',
  'J',
  '\\',
  'X',
  'r',
  'l',
  'v',
  'V',
  't',
  'T',
  'f',
  'F',
  'x',
  '',
  '',
  '',
  '',
  GURMUKHI_BACKSPACE,
];

/**
 * The letter each key enters, for screen readers: a key's text is a Latin code
 * that only the font turns into Gurmukhi, so read aloud it would say `Type a`.
 */
export const GURMUKHI_KEY_LETTERS: Readonly<Record<string, string>> = {
  a: 'ੳ',
  A: 'ਅ',
  e: 'ੲ',
  s: 'ਸ',
  h: 'ਹ',
  q: 'ਤ',
  Q: 'ਥ',
  d: 'ਦ',
  D: 'ਧ',
  n: 'ਨ',
  k: 'ਕ',
  K: 'ਖ',
  g: 'ਗ',
  G: 'ਘ',
  '|': 'ਙ',
  p: 'ਪ',
  P: 'ਫ',
  b: 'ਬ',
  B: 'ਭ',
  m: 'ਮ',
  c: 'ਚ',
  C: 'ਛ',
  j: 'ਜ',
  J: 'ਝ',
  '\\': 'ਞ',
  X: 'ਯ',
  r: 'ਰ',
  l: 'ਲ',
  v: 'ਵ',
  V: 'ੜ',
  t: 'ਟ',
  T: 'ਠ',
  f: 'ਡ',
  F: 'ਢ',
  x: 'ਣ',
};
