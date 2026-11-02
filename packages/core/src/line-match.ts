/**
 * Reading a match back out of a line of Gurbani, and ordering results by it.
 *
 * BaniDB says which lines matched but not where. Knowing where lets a result
 * show why it is there: a shabad found through a line in its middle is otherwise
 * a title that shares no letters with what was typed. The rules are np-mono's
 * tested ones (shabad-search.ts), reduced to the two scripts this app searches.
 */
import type { TitleScript } from './title-script';
import type { Playable } from './types';

/**
 * The letter each GurbaniLipi key enters. Also what screen readers say for a key,
 * whose text is a Latin code that only the font turns into Gurmukhi.
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

/** BaniDB indexes first letters on the vowel carriers, so ਇ and ਈ both count as ੲ. */
const VOWEL_CARRIERS: Readonly<Record<string, string>> = {
  ਇ: 'ੲ',
  ਈ: 'ੲ',
  ਏ: 'ੲ',
  ਉ: 'ੳ',
  ਊ: 'ੳ',
  ਆ: 'ਅ',
  ਐ: 'ਅ',
  ਔ: 'ਅ',
};

const toCarriers = (text: string) =>
  [...text.normalize('NFD').replace(/\p{M}/gu, '')].map((c) => VOWEL_CARRIERS[c] ?? c);

/** A typed term as the letters to find: its keys read as Gurmukhi, or roman as it is. */
function needleOf(term: string, script: TitleScript): string[] {
  if (script === 'en') return [...term.toLowerCase()];
  return toCarriers([...term].map((c) => GURMUKHI_KEY_LETTERS[c] ?? c).join(''));
}

/**
 * A typed term as `shabad_lines` holds its first letters, or nothing when it has
 * spaces and so cannot be initials. packages/aligner/fill_lines.py writes the
 * other side of this.
 */
export function searchLetters(term: string, script: TitleScript): string {
  const trimmed = term.trim();
  return /\s/.test(trimmed) ? '' : needleOf(trimmed, script).join('');
}

/** The words of a line the term's letters landed on, and where they begin. */
function findMatch(line: string, term: string, script: TitleScript) {
  const words = line
    .trim()
    .split(/\s+/)
    .map((word, index) => ({ word, index }))
    // The verse bars and verse numbers are words to split on but not to match.
    .filter(({ word }) => /\p{L}/u.test(word));
  const initials = words.map(({ word }) =>
    script === 'en' ? word[0]!.toLowerCase() : toCarriers(word)[0]!
  );
  const needle = needleOf(term.trim(), script);
  if (!needle.length) return null;
  for (let start = 0; start + needle.length <= initials.length; start++) {
    if (needle.every((letter, i) => initials[start + i] === letter)) {
      return {
        atStart: start === 0,
        indexes: new Set(words.slice(start, start + needle.length).map(({ index }) => index)),
      };
    }
  }
  return null;
}

/** Whether the term's letters open the line, rather than turning up inside it. */
export function matchesLineStart(line: string, term: string, script: TitleScript): boolean {
  return findMatch(line, term, script)?.atStart ?? false;
}

export interface LineSegment {
  text: string;
  match: boolean;
}

/** The line in runs of matched and unmatched text. Whole words: a split word would lose its vowel signs. */
export function lineSegments(line: string, term: string, script: TitleScript): LineSegment[] {
  const found = findMatch(line, term, script);
  if (!found) return [{ text: line, match: false }];
  return line
    .trim()
    .split(/(\s+)/)
    .map((text, i) => ({ text, match: i % 2 === 0 && found.indexes.has(i / 2) }));
}

/**
 * The line with the words a phrase search matched marked, for terms with spaces.
 * `compareTo` is what the term was typed against: the same line in GurbaniLipi
 * when the term is its keys. If the two split differently, nothing is marked,
 * because the indexes would land on the wrong words.
 */
export function phraseSegments(line: string, compareTo: string, term: string): LineSegment[] {
  const parts = term.toLowerCase().trim().split(/\s+/);
  const shown = line.trim().split(/\s+/);
  const compared = compareTo.toLowerCase().trim().split(/\s+/);
  if (shown.length !== compared.length) return [{ text: line, match: false }];
  const matched = compared.map((word) => parts.some((part) => word.startsWith(part)));
  return line
    .trim()
    .split(/(\s+)/)
    .map((text, i) => ({ text, match: i % 2 === 0 && matched[i / 2]! }));
}

/** A BaniDB line, as far as matching it goes. */
export interface LineHit {
  verseId: number;
  shabadId: number;
  verse?: { unicode?: string; gurmukhi?: string };
  transliteration?: { english?: string };
  translation?: { en?: { bdb?: string } };
  source?: { english?: string; sourceId?: string };
  writer?: { english?: string };
  pageNo?: number;
}

/** What a line reads in the language being searched. */
export function lineTextIn(hit: LineHit, script: TitleScript): string {
  return script === 'en'
    ? (hit.transliteration?.english ?? '')
    : (hit.verse?.unicode ?? hit.verse?.gurmukhi ?? '');
}

const anyMarked = (parts: LineSegment[]) => parts.some((part) => part.match);

/**
 * A line as shown in `script`, with the words the term landed on marked. English
 * words may have matched the translation rather than the line, and then the
 * translation is what shows, because the line would not explain the result.
 */
export function hitSegments(hit: LineHit, term: string, script: TitleScript): LineSegment[] {
  const line = lineTextIn(hit, script);
  const trimmed = term.trim();
  const letters = lineSegments(line, trimmed, script);
  if (anyMarked(letters)) return letters;
  // Not first letters: read it as words, against what the term was typed in.
  const typedInUnicode = /[\u0A00-\u0A7F]/.test(trimmed);
  const compareTo = script === 'pa' && !typedInUnicode ? (hit.verse?.gurmukhi ?? '') : line;
  const words = phraseSegments(line, compareTo, trimmed);
  if (anyMarked(words) || script === 'pa') return words;
  const translation = hit.translation?.en?.bdb ?? '';
  const inTranslation = phraseSegments(translation, translation, trimmed);
  return anyMarked(inTranslation) ? inTranslation : words;
}

/** Whether a recording's own title or ragi holds the term: it needs no line to explain it. */
function matchesByText(item: Playable, term: string, script: TitleScript): boolean {
  const needle = term.trim().toLowerCase();
  const texts = script === 'pa' ? [item.titleGurmukhi] : [item.title, item.subtitle, item.artist];
  return texts.some((text) => text?.toLowerCase().includes(needle));
}

/**
 * Search results in the order to show them, and the headings that go before some.
 *
 * Recordings found through a line in their shabad gather under that line, once,
 * however many recordings it has: that line is why they are here, and their
 * titles may share no letters with what was typed. The rest come first, with no
 * heading: their own title or ragi is the match, or they are titled by the line.
 * Groups keep the order their first recording arrived in, which is most played
 * first. A later page joins a heading already on screen, so this runs over
 * everything loaded rather than page by page.
 */
export function groupByLine(
  items: Playable[],
  lines: { hit: LineHit }[] | undefined,
  term: string,
  script: TitleScript
): { items: Playable[]; headings: Map<string, LineSegment[]> } {
  const bestLine = new Map<number, LineHit>();
  for (const { hit } of lines ?? []) {
    if (!bestLine.has(hit.shabadId)) bestLine.set(hit.shabadId, hit);
  }
  const lineOf = (item: Playable) =>
    item.shabadId == null || matchesByText(item, term, script)
      ? undefined
      : bestLine.get(item.shabadId);
  // Decided per shabad: its recordings stay together even when only some of them
  // are titled by the matched line, rather than one at the top and the rest below.
  const grouped = new Set<number>();
  for (const item of items) {
    const hit = lineOf(item);
    if (hit && hit.verseId !== item.mainVerseId) grouped.add(hit.shabadId);
  }
  const plain: Playable[] = [];
  const groups = new Map<number, Playable[]>();
  for (const item of items) {
    const hit = lineOf(item);
    if (!hit || !grouped.has(hit.shabadId)) plain.push(item);
    else if (groups.has(hit.shabadId)) groups.get(hit.shabadId)!.push(item);
    else groups.set(hit.shabadId, [item]);
  }
  const headings = new Map<string, LineSegment[]>();
  for (const [shabadId, group] of groups) {
    headings.set(group[0]!.id, hitSegments(bestLine.get(shabadId)!, term, script));
  }
  return { items: [...plain, ...[...groups.values()].flat()], headings };
}

/** Who wrote a line and where it is: enough to tell two like lines apart. */
export function lineDetails(hit: LineHit): string {
  const inGranth = hit.source?.sourceId === 'G';
  return [
    inGranth ? null : hit.source?.english,
    hit.writer?.english,
    hit.pageNo == null ? null : `${inGranth ? 'Ang' : 'Page'} ${hit.pageNo}`,
  ]
    .filter(Boolean)
    .join(' · ');
}
