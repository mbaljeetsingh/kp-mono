/**
 * Reading a first-letter match back out of a line of Gurbani.
 *
 * BaniDB says which lines matched but not where. Knowing where lets a result
 * show why it is there: a shabad found through a line in its middle is otherwise
 * a title that shares no letters with what was typed. The rules are np-mono's
 * tested ones (shabad-search.ts), reduced to the two scripts this app searches.
 */
import type { TitleScript } from '@kp/core';

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
