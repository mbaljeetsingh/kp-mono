/**
 * BaniDB search.
 *
 * Shared by the tagging workbench, where it links a shabad to a rendition, and
 * by the player's read-along, where a listener on a live broadcast can look up
 * what they are hearing for themselves.
 */
import { lineTextIn, matchesLineStart, type LineHit, type TitleScript } from '@kp/core';
import { useQuery } from '@tanstack/react-query';

import { keys } from './keys';

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

/** First letters from the start of a line only: Gurmukhi or GurbaniLipi keys. */
const LINE_START_SEARCH_TYPE = 0;

/**
 * Words, for a term with spaces. English gets BaniDB's omni search, which allows
 * for spelling (`jag jeevan` finds ਜਗਿ ਜੀਵਨੁ) and reaches translations, but is
 * undocumented. Punjabi gets its word
 * search, which wants the exact spelling: that needs vowels, so a physical
 * keyboard, as the on-screen keys are consonants only.
 */
const WORD_SEARCH_TYPE: Record<TitleScript, number> = { en: 8, pa: 2 };

/**
 * Below this, initials match too much of Gurbani to be worth asking: `jj` is
 * 4,304 lines, `jja` 205.
 */
export const MIN_FIRST_LETTERS = 3;

/**
 * Enough to recognise the line without turning a panel into a second list to read,
 * and all a lookup asks for: at about 2.7 KB a line, with no compression, 200 lines
 * was 550 KB to show 20. Roman pays for it on a term with many lines, since BaniDB
 * answers in shabad order: one more letter narrows it.
 */
const LINE_LIST_LIMIT = 20;

/** Long enough for BaniDB's slower answers, short enough not to leave a panel hanging on a stall. */
const LINE_SEARCH_TIMEOUT_MS = 6000;

export interface BaniDbHit extends LineHit {
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

/** One matched line, and whether the letters opened it or turned up inside it. */
export interface LineMatch {
  hit: BaniDbHit;
  atStart: boolean;
}

export interface LineMatches {
  /** Lines that open with the letters first: that is what someone usually remembers. */
  lines: LineMatch[];
}

async function readHits(base: string, term: string, searchType: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LINE_SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${base}/search/${encodeURIComponent(term)}?searchtype=${searchType}&results=${LINE_LIST_LIMIT}`,
      { signal: controller.signal }
    );
    if (!res.ok) throw new Error(`BaniDB returned ${res.status}`);
    const json = (await res.json()) as { verses?: BaniDbHit[] };
    return json.verses ?? [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Every line with these first letters, opening matches first.
 *
 * BaniDB returns hits in shabad order, so an "anywhere" search alone buries the
 * line somebody meant under lines that merely contain the letters: `hjb` is 19
 * lines that open with them and 86 that hold them. Punjabi asks for both. Roman
 * has only "anywhere", so its openers are found by reading the lines; past the
 * cap they stay unfound.
 */
export async function firstLetterLines(
  base: string,
  term: string,
  script: TitleScript
): Promise<LineMatches> {
  if (script === 'en') {
    const verses = await readHits(base, term, LANGUAGE_SEARCH_TYPE.en);
    const lines = verses.map((hit) => ({
      hit,
      atStart: matchesLineStart(hit.transliteration?.english ?? '', term, 'en'),
    }));
    return {
      lines: [...lines.filter((l) => l.atStart), ...lines.filter((l) => !l.atStart)],
    };
  }
  const [opening, anywhere] = await Promise.allSettled([
    readHits(base, term, LINE_START_SEARCH_TYPE),
    readHits(base, term, LANGUAGE_SEARCH_TYPE.pa),
  ]);
  // Punjabi has nothing else to search, so one answer beats an error. Only both
  // failing is a failure, and either answer alone can still be ranked.
  if (opening.status === 'rejected' && anywhere.status === 'rejected') throw opening.reason;
  const openers = opening.status === 'fulfilled' ? opening.value : [];
  const others = anywhere.status === 'fulfilled' ? anywhere.value : [];
  const opened = new Set(openers.map((hit) => hit.verseId));
  const atStart = (hit: BaniDbHit) =>
    opening.status === 'rejected' && matchesLineStart(lineTextIn(hit, 'pa'), term, 'pa');
  const rest = others
    .filter((hit) => !opened.has(hit.verseId))
    .map((hit) => ({ hit, atStart: atStart(hit) }));
  return {
    lines: [
      ...openers.map((hit) => ({ hit, atStart: true })),
      ...rest.filter((line) => line.atStart),
      ...rest.filter((line) => !line.atStart),
    ],
  };
}

async function wordLines(base: string, term: string, script: TitleScript): Promise<LineMatches> {
  const verses = await readHits(base, term, WORD_SEARCH_TYPE[script]);
  return { lines: verses.map((hit) => ({ hit, atStart: false })) };
}

/**
 * The lines a term finds, whichever way it was typed. A single roman word that
 * is nobody's initials (`waheguru`) gets a second try as a word, so a word needs
 * no space to be found.
 */
export async function linesMatching(
  base: string,
  term: string,
  script: TitleScript
): Promise<LineMatches> {
  if (/\s/.test(term)) return wordLines(base, term, script);
  const found = await firstLetterLines(base, term, script);
  return found.lines.length || script === 'pa' ? found : wordLines(base, term, script);
}

/** The read-along's and the workbench's list: the best few lines to recognise. */
export function useMatchingLines(base: string, term: string, script: TitleScript) {
  const trimmed = term.trim();
  return useQuery({
    queryKey: keys.banidb.lines(script, trimmed),
    queryFn: () => linesMatching(base, trimmed, script),
    select: (found) => found.lines.slice(0, LINE_LIST_LIMIT).map((line) => line.hit),
    enabled: trimmed.length >= MIN_FIRST_LETTERS,
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
