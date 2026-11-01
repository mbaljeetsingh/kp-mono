import { afterEach, describe, expect, it, vi } from 'vitest';

import { shabadIdsMatching } from './banidb';

describe('shabadIdsMatching', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('gives each shabad once, however many of its lines matched', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        resultsInfo: { totalResults: 3 },
        verses: [{ shabadId: 7 }, { shabadId: 7 }, { shabadId: 9 }],
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(shabadIdsMatching('/banidb', 'jjas', 7)).resolves.toEqual({
      ids: [7, 9],
      partial: false,
    });
  });

  it('says when BaniDB held more lines than it sent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ resultsInfo: { totalResults: 4304 }, verses: [{ shabadId: 7 }] })
      )
    );
    await expect(shabadIdsMatching('/banidb', 'jj', 7)).resolves.toMatchObject({ partial: true });
  });

  it('throws what BaniDB refused, so a caller can fall back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 }))
    );
    await expect(shabadIdsMatching('/banidb', 'jjas', 7)).rejects.toThrow('503');
  });
});
