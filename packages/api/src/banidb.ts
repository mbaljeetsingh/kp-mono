/**
 * BaniDB search.
 *
 * Shared by the tagging workbench, where it links a shabad to a rendition, and
 * by the player's read-along, where a listener on a live broadcast can look up
 * what they are hearing for themselves.
 */
import type { Playable, TitleScript } from '@kp/core';
import { useQuery } from '@tanstack/react-query';

import { lineSegments, matchesLineStart, phraseSegments, type LineSegment } from './first-letters';
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

/**
 * Below this, initials match too much of Gurbani to be worth asking: `jj` is
 * 4,304 lines, `jja` 205.
 */
/** First letters from the start of a line only: Gurmukhi or GurbaniLipi keys. */
const LINE_START_SEARCH_TYPE = 0;

/**
 * Words, for a term with spaces. English gets BaniDB's omni search, which allows
 * for spelling (`jag jeevan` finds ਜਗਿ ਜੀਵਨੁ) and reaches translations, but is
 * undocumented, so a failure falls back as any other does. Punjabi gets its word
 * search, which wants the exact spelling: that needs vowels, so a physical
 * keyboard, as the on-screen keys are consonants only.
 */
const WORD_SEARCH_TYPE: Record<TitleScript, number> = { en: 8, pa: 2 };

export const MIN_FIRST_LETTERS = 3;

/** Enough to recognise the line without turning a panel into a second list to read. */
const LINE_LIST_LIMIT = 20;

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
  source?: { english?: string; sourceId?: string };
  pageNo?: number;
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

/** One matched line, and whether the letters opened it or turned up inside it. */
export interface LineMatch {
  hit: BaniDbHit;
  atStart: boolean;
}

export interface LineMatches {
  /** Lines that open with the letters first: that is what someone usually remembers. */
  lines: LineMatch[];
  /** BaniDB held more lines than one search reads, so a recording may be missing. */
  partial: boolean;
}

async function readHits(base: string, term: string, searchType: number) {
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
    return { verses: json.verses ?? [], total: json.resultsInfo?.totalResults ?? 0 };
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
 * cap they stay unfound, which `partial` owns up to.
 */
export async function firstLetterLines(
  base: string,
  term: string,
  script: TitleScript
): Promise<LineMatches> {
  if (script === 'en') {
    const { verses, total } = await readHits(base, term, LANGUAGE_SEARCH_TYPE.en);
    const lines = verses.map((hit) => ({
      hit,
      atStart: matchesLineStart(hit.transliteration?.english ?? '', term, 'en'),
    }));
    return {
      lines: [...lines.filter((l) => l.atStart), ...lines.filter((l) => !l.atStart)],
      partial: total > verses.length,
    };
  }
  const [opening, anywhere] = await Promise.all([
    readHits(base, term, LINE_START_SEARCH_TYPE),
    readHits(base, term, LANGUAGE_SEARCH_TYPE.pa),
  ]);
  const opened = new Set(opening.verses.map((hit) => hit.verseId));
  return {
    lines: [
      ...opening.verses.map((hit) => ({ hit, atStart: true })),
      ...anywhere.verses
        .filter((hit) => !opened.has(hit.verseId))
        .map((hit) => ({ hit, atStart: false })),
    ],
    partial: anywhere.total > anywhere.verses.length,
  };
}

async function wordLines(base: string, term: string, script: TitleScript): Promise<LineMatches> {
  const { verses, total } = await readHits(base, term, WORD_SEARCH_TYPE[script]);
  return {
    lines: verses.map((hit) => ({ hit, atStart: false })),
    partial: total > verses.length,
  };
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

/** A line as shown in `script`, with the words the term landed on marked. */
export function hitSegments(hit: BaniDbHit, term: string, script: TitleScript): LineSegment[] {
  const line = lineTextIn(hit, script);
  const trimmed = term.trim();
  const letters = lineSegments(line, trimmed, script);
  if (letters.some((part) => part.match)) return letters;
  // Not first letters: read it as words, against what the term was typed in.
  const typedInUnicode = /[\u0A00-\u0A7F]/.test(trimmed);
  const compareTo = script === 'pa' && !typedInUnicode ? (hit.verse?.gurmukhi ?? '') : line;
  return phraseSegments(line, compareTo, trimmed);
}

/** A shabad's id once, keeping the order: its best line decides where it ranks. */
export function shabadIdsOf(lines: LineMatch[]): number[] {
  return [...new Set(lines.map((line) => line.hit.shabadId))];
}

/** What a line reads in the language being searched. */
export function lineTextIn(hit: BaniDbHit, script: TitleScript): string {
  return script === 'en'
    ? (hit.transliteration?.english ?? '')
    : (hit.verse?.unicode ?? hit.verse?.gurmukhi ?? '');
}

/**
 * Search results in the order to show them, and the headings that go before some.
 *
 * Recordings found through a line in their shabad gather under that line, once,
 * however many recordings it has: that line is why they are here, and their
 * titles may share no letters with what was typed. The rest come first, with no
 * heading, because their own title is the match. Groups keep the order their first
 * recording arrived in, which is most played first. A later page joins a heading
 * already on screen, so this runs over everything loaded rather than page by page.
 */
export function groupByLine(
  items: Playable[],
  lines: LineMatch[] | undefined,
  term: string,
  script: TitleScript
): { items: Playable[]; headings: Map<string, LineSegment[]> } {
  const bestLine = new Map<number, BaniDbHit>();
  for (const { hit } of lines ?? []) {
    if (!bestLine.has(hit.shabadId)) bestLine.set(hit.shabadId, hit);
  }
  // Decided per shabad: its recordings stay together even when only some of them
  // are titled by the matched line, rather than one at the top and the rest below.
  const titledByLine = new Set(
    [...bestLine.values()]
      .filter((hit) =>
        items
          .filter((item) => item.shabadId === hit.shabadId)
          .every((item) => item.mainVerseId === hit.verseId)
      )
      .map((hit) => hit.shabadId)
  );
  const plain: Playable[] = [];
  const groups = new Map<number, Playable[]>();
  for (const item of items) {
    const hit = item.shabadId == null ? undefined : bestLine.get(item.shabadId);
    if (!hit || titledByLine.has(hit.shabadId)) plain.push(item);
    else groups.set(hit.shabadId, [...(groups.get(hit.shabadId) ?? []), item]);
  }
  const headings = new Map<string, LineSegment[]>();
  for (const [shabadId, group] of groups) {
    headings.set(group[0]!.id, hitSegments(bestLine.get(shabadId)!, term, script));
  }
  return { items: [...plain, ...[...groups.values()].flat()], headings };
}

/** Who wrote a line and where it is: enough to tell two like lines apart. */
export function lineDetails(hit: BaniDbHit): string {
  const inGranth = hit.source?.sourceId === 'G';
  return [
    inGranth ? null : hit.source?.english,
    hit.writer?.english,
    hit.pageNo == null ? null : `${inGranth ? 'Ang' : 'Page'} ${hit.pageNo}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The read-along's and the workbench's list: the best few lines to recognise. */
export function useFirstLetterLines(base: string, term: string, script: TitleScript) {
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
