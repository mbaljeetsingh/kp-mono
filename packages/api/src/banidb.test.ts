import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Playable } from '@kp/core';

import {
  firstLetterLines,
  GURMUKHI_BACKSPACE,
  GURMUKHI_KEYS,
  groupByLine,
  hitSegments,
  lineDetails,
  linesMatching,
} from './banidb';
import { GURMUKHI_KEY_LETTERS, lineSegments, matchesLineStart } from './first-letters';

const line = (verseId: number, shabadId: number, unicode: string, english = '') => ({
  verseId,
  shabadId,
  verse: { unicode },
  transliteration: { english },
});

describe('firstLetterLines', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('puts Punjabi lines opening on the letters first, each line once', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        Response.json(
          url.includes('searchtype=0')
            ? { resultsInfo: { totalResults: 1 }, verses: [line(9, 90, 'open')] }
            : {
                resultsInfo: { totalResults: 2 },
                verses: [line(1, 10, 'inside'), line(9, 90, 'open')],
              }
        )
      )
    );
    const found = await firstLetterLines('/banidb', 'hjb', 'pa');
    expect(found.lines.map((l) => [l.hit.verseId, l.atStart])).toEqual([
      [9, true],
      [1, false],
    ]);
    expect(found.partial).toBe(false);
  });

  it('finds roman openers by reading the lines', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          resultsInfo: { totalResults: 3 },
          verses: [
            line(1, 10, '', 'kat jag jivan aisa'),
            line(2, 20, '', 'jag jivan aisa supane ||'),
          ],
        })
      )
    );
    const found = await firstLetterLines('/banidb', 'jja', 'en');
    expect(found.lines.map((l) => l.hit.verseId)).toEqual([2, 1]);
    // Three held, two sent.
    expect(found.partial).toBe(true);
  });

  it('throws what BaniDB refused, so a caller can fall back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 }))
    );
    await expect(firstLetterLines('/banidb', 'jjas', 'en')).rejects.toThrow('503');
  });
});

describe('linesMatching', () => {
  afterEach(() => vi.unstubAllGlobals());
  const asked = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls.map(([url]) =>
      new URL(url as string, 'http://x').searchParams.get('searchtype')
    );

  it('sends English words to omni search and Punjabi words to word search', async () => {
    const fetchMock = vi.fn(async () => Response.json({ verses: [line(1, 10, 'x')] }));
    vi.stubGlobal('fetch', fetchMock);
    await linesMatching('/banidb', 'jag jivan', 'en');
    await linesMatching('/banidb', 'jig jIvnu', 'pa');
    expect(asked(fetchMock)).toEqual(['8', '2']);
  });

  it("tries a roman word as a word once it is nobody's initials", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      Response.json({ verses: url.includes('searchtype=8') ? [line(1, 10, 'x')] : [] })
    );
    vi.stubGlobal('fetch', fetchMock);
    const found = await linesMatching('/banidb', 'waheguru', 'en');
    expect(asked(fetchMock)).toEqual(['7', '8']);
    expect(found.lines).toHaveLength(1);
  });

  it('does not ask twice when the initials found something', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ verses: [line(1, 10, 'x', 'jag jivan aisa')] })
    );
    vi.stubGlobal('fetch', fetchMock);
    await linesMatching('/banidb', 'jja', 'en');
    expect(asked(fetchMock)).toEqual(['7']);
  });
});

describe('hitSegments', () => {
  const hit = {
    verseId: 1,
    shabadId: 1,
    verse: { unicode: 'ਜਗਿ ਜੀਵਨੁ ਐਸਾ', gurmukhi: 'jig jIvnu AYsw' },
    transliteration: { english: 'jag jeevan aaisaa' },
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

  it('marks nothing when a translation is what matched', () => {
    expect(marked('peace of mind', 'en')).toEqual([]);
  });
});

describe('groupByLine', () => {
  const recording = (id: string, shabadId: number, mainVerseId: number) =>
    ({ id, shabadId, mainVerseId }) as Playable;
  const matched = (verseId: number, shabadId: number, unicode: string) => ({
    hit: line(verseId, shabadId, unicode),
    atStart: false,
  });

  it('gathers a shabad under its line, after recordings its title matched', () => {
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
    expect(headings.get('a')?.[0]).toEqual({ text: 'ਮਛੁਲੀ', match: false });
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

describe('reading a match out of a line', () => {
  const line468 = 'ਮਛੁਲੀ ਹੋਵਾ ਜਲਿ ਬਸਾ ਜੀਅ ਜੰਤ ਸਭਿ ਸਾਰਿ ॥';

  it('finds GurbaniLipi keys inside a Gurmukhi line', () => {
    const matched = lineSegments(line468, 'hjb', 'pa')
      .filter((s) => s.match)
      .map((s) => s.text);
    expect(matched).toEqual(['ਹੋਵਾ', 'ਜਲਿ', 'ਬਸਾ']);
  });

  it('keeps the line whole', () => {
    const joined = lineSegments(line468, 'hjb', 'pa')
      .map((s) => s.text)
      .join('');
    expect(joined).toBe(line468);
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

describe('GURMUKHI_KEY_LETTERS', () => {
  it('names every key on the keyboard, so none is read aloud as its Latin code', () => {
    const letterKeys = GURMUKHI_KEYS.filter((key) => key && key !== GURMUKHI_BACKSPACE);
    expect(Object.keys(GURMUKHI_KEY_LETTERS).sort()).toEqual([...letterKeys].sort());
  });
});
