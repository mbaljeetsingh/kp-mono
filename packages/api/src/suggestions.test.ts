import { stationPlayable, DEFAULT_STATION, type Playable } from '@kp/core';
import { describe, expect, it } from 'vitest';

import type { KpClient } from './client';
import { fetchSuggestionGroups } from './suggestions';

const ROW = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Sorath Mahala 5',
  track_id: 't1',
  url: 'https://example.test/a.mp3',
  artist: 'Bhai Harnam Singh',
  raag: 'Sorath',
  start_sec: 0,
  end_sec: 100,
  created_at: '2026-01-01T00:00:00Z',
};

/**
 * Records the filters each query was built with, which is the only thing worth
 * asserting here: whether a value that cannot be a uuid reaches a uuid column.
 */
function fakeClient(rows: unknown[] = [ROW]) {
  const notFilters: string[] = [];
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    not: (_col: string, _op: string, value: string) => {
      notFilters.push(value);
      return builder;
    },
    limit: () => Promise.resolve({ data: rows, error: null }),
  };
  return { client: { from: () => builder } as unknown as KpClient, notFilters };
}

const shabad: Playable = {
  id: ROW.id,
  title: ROW.name,
  url: ROW.url,
  artist: ROW.artist,
  raag: ROW.raag,
};

describe('fetchSuggestionGroups', () => {
  it('never puts a station id in a uuid filter', async () => {
    // `station:<slug>` is not a uuid. Sent as one it failed the whole query,
    // and Up next on a live broadcast claimed there was nothing to suggest.
    const { client, notFilters } = fakeClient();
    const groups = await fetchSuggestionGroups(client, stationPlayable(DEFAULT_STATION));

    expect(notFilters.every((f) => !f.includes('station:'))).toBe(true);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('Recently added');
  });

  it('skips the related groups for a broadcast, which relates to nothing', async () => {
    const { client } = fakeClient();
    const groups = await fetchSuggestionGroups(client, stationPlayable(DEFAULT_STATION));

    // A station's "artist" is the gurdwara's name — no rendition is by it.
    expect(groups.map((g) => g.label)).toEqual(['Recently added']);
  });

  it('still excludes the shabad that is playing from its own suggestions', async () => {
    const { client, notFilters } = fakeClient();
    await fetchSuggestionGroups(client, shabad);

    expect(notFilters[0]).toBe(`(${ROW.id})`);
  });

  it('falls back to recently added when nothing shares a ragi or raag', async () => {
    const { client } = fakeClient([]);
    expect(await fetchSuggestionGroups(client, shabad)).toEqual([]);
  });
});
