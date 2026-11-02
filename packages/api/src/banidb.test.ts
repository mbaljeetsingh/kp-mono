import { afterEach, describe, expect, it, vi } from 'vitest';

import { GURMUKHI_KEY_LETTERS } from '@kp/core';

import { firstLetterLines, GURMUKHI_BACKSPACE, GURMUKHI_KEYS, linesMatching } from './banidb';

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

describe('GURMUKHI_KEY_LETTERS', () => {
  it('names every key on the keyboard, so none is read aloud as its Latin code', () => {
    const letterKeys = GURMUKHI_KEYS.filter((key) => key && key !== GURMUKHI_BACKSPACE);
    expect(Object.keys(GURMUKHI_KEY_LETTERS).sort()).toEqual([...letterKeys].sort());
  });
});
