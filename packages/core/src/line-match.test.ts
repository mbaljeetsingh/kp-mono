import { describe, expect, it } from 'vitest';

import {
  groupByLine,
  hitSegments,
  lineDetails,
  lineSegments,
  matchesLineStart,
} from './line-match';
import type { Playable } from './types';

const line = (verseId: number, shabadId: number, unicode: string) => ({
  verseId,
  shabadId,
  verse: { unicode },
});

describe('reading a match out of a line', () => {
  const line468 = 'ਮਛੁਲੀ ਹੋਵਾ ਜਲਿ ਬਸਾ ਜੀਅ ਜੰਤ ਸਭਿ ਸਾਰਿ ॥';

  it('finds GurbaniLipi keys inside a Gurmukhi line', () => {
    const matched = lineSegments(line468, 'hjb', 'pa')
      .filter((s) => s.match)
      .map((s) => s.text);
    expect(matched).toEqual(['ਹੋਵਾ', 'ਜਲਿ', 'ਬਸਾ']);
  });

  it('keeps the line whole', () => {
    expect(
      lineSegments(line468, 'hjb', 'pa')
        .map((s) => s.text)
        .join('')
    ).toBe(line468);
  });

  it('tells an opening match from one inside', () => {
    expect(matchesLineStart(line468, 'mhj', 'pa')).toBe(true);
    expect(matchesLineStart(line468, 'hjb', 'pa')).toBe(false);
  });

  it('reads a vowel by its carrier', () => {
    expect(matchesLineStart('ਇਕੁ ਨਾਮੁ ਬੋਵਹੁ', 'enb', 'pa')).toBe(true);
    expect(matchesLineStart('ਆਦਿ ਸਚੁ', 'As', 'pa')).toBe(true);
  });

  it('matches roman, whatever the case', () => {
    const matched = lineSegments('Jag jivan aisa', 'JJ', 'en').filter((s) => s.match);
    expect(matched.map((s) => s.text)).toEqual(['Jag', 'jivan']);
  });

  it('leaves a line it cannot place unmarked', () => {
    expect(lineSegments('ਸਭ ਕਿਛੁ', 'hjb', 'pa')).toEqual([{ text: 'ਸਭ ਕਿਛੁ', match: false }]);
  });
});

describe('hitSegments', () => {
  const hit = {
    verseId: 1,
    shabadId: 1,
    verse: { unicode: 'ਜਗਿ ਜੀਵਨੁ ਐਸਾ', gurmukhi: 'jig jIvnu AYsw' },
    transliteration: { english: 'jag jeevan aaisaa' },
    translation: { en: { bdb: 'The life of the world is only a dream' } },
  };
  const marked = (term: string, script: 'en' | 'pa') =>
    hitSegments(hit, term, script)
      .filter((part) => part.match)
      .map((part) => part.text);

  it('marks roman words on the roman line', () => {
    expect(marked('jag jeevan', 'en')).toEqual(['jag', 'jeevan']);
  });

  it('marks words typed in GurbaniLipi on the Gurmukhi line', () => {
    expect(marked('jig jIvnu', 'pa')).toEqual(['ਜਗਿ', 'ਜੀਵਨੁ']);
  });

  it('marks words typed in Gurmukhi', () => {
    expect(marked('ਜੀਵਨੁ ਐਸਾ', 'pa')).toEqual(['ਜੀਵਨੁ', 'ਐਸਾ']);
  });

  it('shows the translation when that is what the words matched', () => {
    const parts = hitSegments(hit, 'world dream', 'en');
    expect(parts.map((part) => part.text).join('')).toBe('The life of the world is only a dream');
    expect(parts.filter((part) => part.match).map((part) => part.text)).toEqual(['world', 'dream']);
  });

  it('keeps the roman line when nothing explains the match', () => {
    expect(
      hitSegments(hit, 'zzz qqq', 'en')
        .map((part) => part.text)
        .join('')
    ).toBe('jag jeevan aaisaa');
  });
});

describe('groupByLine', () => {
  const recording = (id: string, shabadId: number, mainVerseId: number, title = 'x') =>
    ({ id, shabadId, mainVerseId, title }) as Playable;
  const matched = (verseId: number, shabadId: number, unicode: string) => ({
    hit: line(verseId, shabadId, unicode),
  });

  it('gathers a shabad under its line, after recordings titled by theirs', () => {
    const { items, headings } = groupByLine(
      [recording('a', 468, 6521), recording('b', 1794, 9), recording('c', 468, 6521)],
      [matched(6525, 468, 'ਮਛੁਲੀ ਹੋਵਾ ਜਲਿ ਬਸਾ ਜੀਅ'), matched(9, 1794, 'ਹਰਿ ਜਪਿ ਬਿਨੁ')],
      'hjb',
      'pa'
    );
    expect(items.map((i) => i.id)).toEqual(['b', 'a', 'c']);
    expect([...headings.keys()]).toEqual(['a']);
    // The whole line, with the matched words marked inside it.
    expect(
      headings
        .get('a')
        ?.map((part) => part.text)
        .join('')
    ).toBe('ਮਛੁਲੀ ਹੋਵਾ ਜਲਿ ਬਸਾ ਜੀਅ');
  });

  it('keeps a shabad together when only some recordings are titled by the line', () => {
    const { items, headings } = groupByLine(
      [recording('a', 1, 3), recording('z', 2, 8), recording('b', 1, 4)],
      [matched(3, 1, 'ਹੋਵਾ ਜਲਿ ਬਸਾ')],
      'hjb',
      'pa'
    );
    expect(items.map((i) => i.id)).toEqual(['z', 'a', 'b']);
    expect([...headings.keys()]).toEqual(['a']);
  });

  it('keeps groups in the order they arrived, which is most played first', () => {
    const { items } = groupByLine(
      [recording('top', 5, 1), recording('next', 6, 1), recording('top2', 5, 1)],
      [matched(50, 5, 'ਹੋਵਾ ਜਲਿ ਬਸਾ'), matched(60, 6, 'ਹੋਵਾ ਜਲਿ ਬਸਾ')],
      'hjb',
      'pa'
    );
    expect(items.map((i) => i.id)).toEqual(['top', 'top2', 'next']);
  });

  it('leaves a recording its title matched at the top, whatever line its shabad has', () => {
    const { items, headings } = groupByLine(
      [recording('other', 2, 9), recording('direct', 1, 3, 'Jag Jivan Aisa')],
      [matched(5, 1, 'x'), matched(6, 2, 'y')],
      'jag',
      'en'
    );
    expect(items.map((i) => i.id)).toEqual(['direct', 'other']);
    expect([...headings.keys()]).toEqual(['other']);
  });

  it('leaves a title or ragi search alone', () => {
    const items = [recording('a', 1, 1)];
    expect(groupByLine(items, [], 'jag', 'en')).toEqual({ items, headings: new Map() });
  });
});

describe('lineDetails', () => {
  it('names the writer and the ang, and leaves the Granth itself unsaid', () => {
    expect(
      lineDetails({
        ...line(1, 1, ''),
        pageNo: 157,
        source: { sourceId: 'G', english: 'Sri Guru Granth Sahib Ji' },
        writer: { english: 'Guru Nanak Dev Ji' },
      })
    ).toBe('Guru Nanak Dev Ji · Ang 157');
  });
});
