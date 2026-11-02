import { describe, expect, it } from 'vitest';

import type { KpClient } from './client';
import {
  ilikePattern,
  otherRecordings,
  PAGE_SIZE,
  rankedSearchPage,
  searchShabads,
  shabadById,
  shabadsByIds,
} from './queries';

describe('ilikePattern', () => {
  it('quotes the pattern so a comma cannot end the or() filter', () => {
    // `or=(a.ilike.X,b.ilike.X)` is comma-separated in PostgREST's own grammar.
    // Unquoted, a comma in the term ended the filter early and the request
    // came back 400 — a search for "jag,jivan" failed outright.
    expect(ilikePattern('jag,jivan')).toBe('"%jag,jivan%"');
  });

  it('escapes ILIKE wildcards, so an underscore means an underscore', () => {
    // Doubled: the quoting layer unescapes one backslash on the way in, and
    // ILIKE sees the other.
    expect(ilikePattern('jag_jivan')).toBe('"%jag\\\\_jivan%"');
    expect(ilikePattern('100%')).toBe('"%100\\\\%%"');
  });

  it('escapes a double quote, which would otherwise close the pattern', () => {
    expect(ilikePattern('say "hello"')).toBe('"%say \\"hello\\"%"');
  });

  it('leaves an ordinary term alone but for the quotes', () => {
    expect(ilikePattern('gurwinder')).toBe('"%gurwinder%"');
  });
});

describe('otherRecordings', () => {
  function fakeClient(result: { data: unknown[] | null; error: unknown }) {
    const calls: unknown[][] = [];
    const chain = {
      select: () => chain,
      eq: (...args: unknown[]) => (calls.push(['eq', ...args]), chain),
      neq: (...args: unknown[]) => (calls.push(['neq', ...args]), chain),
      order: () => chain,
      limit: () => Promise.resolve(result),
    };
    return { client: { from: () => chain } as unknown as KpClient, calls };
  }

  it('asks for the shabad, leaving out the recording already playing', async () => {
    const { client, calls } = fakeClient({
      data: [{ id: 'b', name: 'Other', url: 'https://example.test/b.mp3' }],
      error: null,
    });
    const rows = await otherRecordings(client, 7, 'a');
    expect(rows.map((r) => r.id)).toEqual(['b']);
    expect(calls).toEqual([
      ['eq', 'shabad_id', 7],
      ['neq', 'id', 'a'],
    ]);
  });

  it('throws what the server refused', async () => {
    const { client } = fakeClient({ data: null, error: { code: '42501', message: 'nope' } });
    await expect(otherRecordings(client, 7, 'a')).rejects.toThrow();
  });
});

describe('shabadsByIds', () => {
  const row = (id: string) => ({ id, name: `Shabad ${id}`, url: `https://example.test/${id}.mp3` });

  /** Answers each `in('id', …)` with the rows it holds, recording the batches. */
  function fakeClient(held: Set<string>, failOn?: number) {
    const batches: string[][] = [];
    const client = {
      from: () => ({
        select: () => ({
          in: (_col: string, ids: string[]) => {
            batches.push(ids);
            if (batches.length === failOn) {
              return Promise.resolve({ data: null, error: { code: '42501', message: 'nope' } });
            }
            return Promise.resolve({
              data: ids.filter((id) => held.has(id)).map(row),
              error: null,
            });
          },
        }),
      }),
    };
    return { client: client as unknown as KpClient, batches };
  }

  it('asks in batches a URL can carry, and keeps the saved order', async () => {
    // 260 ids in one in.() filter crossed the gateway's URI limit and the
    // whole Saved page failed.
    const ids = Array.from({ length: 260 }, (_, i) => `id-${i}`);
    const { client, batches } = fakeClient(new Set(['id-259', 'id-3', 'id-140']));
    const found = await shabadsByIds(client, ids);
    expect(batches.map((b) => b.length)).toEqual([100, 100, 60]);
    expect(found.map((p) => p.id)).toEqual(['id-3', 'id-140', 'id-259']);
  });

  it('fails the whole list when a batch fails, rather than showing part of it', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `id-${i}`);
    const { client } = fakeClient(new Set(ids), 2);
    await expect(shabadsByIds(client, ids)).rejects.toThrow('nope');
  });

  it('asks nothing for an empty list', async () => {
    const { client, batches } = fakeClient(new Set());
    expect(await shabadsByIds(client, [])).toEqual([]);
    expect(batches).toEqual([]);
  });
});

describe('shabadById', () => {
  const ID = '73368cfa-a6cd-4d34-83b9-5873f0c284f6';

  /** Answers `eq('id', …).maybeSingle()` with whatever it is handed. */
  function fakeClient(answer: { data: unknown; error: unknown }) {
    const asked: string[] = [];
    const client = {
      from: () => ({
        select: () => ({
          eq: (_col: string, id: string) => {
            asked.push(id);
            return { maybeSingle: () => Promise.resolve(answer) };
          },
        }),
      }),
    };
    return { client: client as unknown as KpClient, asked };
  }

  it('maps a published row to a Playable on the file`s clock', async () => {
    const { client, asked } = fakeClient({
      data: {
        id: ID,
        name: 'Mauli Dharati',
        url: 'https://example.test/set.mp3',
        start_sec: '109.33',
        end_sec: '495.00',
      },
      error: null,
    });
    const found = await shabadById(client, ID);
    expect(asked).toEqual([ID]);
    expect(found).toMatchObject({ id: ID, title: 'Mauli Dharati', startSec: 109.33, endSec: 495 });
  });

  it('is null for an id the view does not hold — unpublished, or never was', async () => {
    const { client } = fakeClient({ data: null, error: null });
    expect(await shabadById(client, ID)).toBeNull();
  });

  it('is null for a malformed id, without asking — Postgres would refuse it as a uuid', async () => {
    const { client, asked } = fakeClient({ data: null, error: null });
    expect(await shabadById(client, 'not-a-uuid')).toBeNull();
    expect(await shabadById(client, '')).toBeNull();
    expect(asked).toEqual([]);
  });

  it('is null for a row that fails the schema, rather than a half-built Playable', async () => {
    const { client } = fakeClient({ data: { id: ID, name: 'No url' }, error: null });
    expect(await shabadById(client, ID)).toBeNull();
  });

  it('throws a real failure, so a link that could not load is not called missing', async () => {
    const { client } = fakeClient({ data: null, error: { code: '08006', message: 'down' } });
    await expect(shabadById(client, ID)).rejects.toThrow('down');
  });
});

describe('searchShabads', () => {
  function fakeClient() {
    const filters: string[] = [];
    const chain = {
      select: () => chain,
      range: () => chain,
      or: (filter: string) => (filters.push(filter), chain),
      order: () => chain,
      then: (resolve: (r: { data: unknown[]; error: null }) => void) =>
        resolve({ data: [], error: null }),
    };
    return { client: { from: () => chain } as unknown as KpClient, filters };
  }

  it('finds roman titles, ragis and the shabads BaniDB matched', async () => {
    const { client, filters } = fakeClient();
    await searchShabads(client, 'jjas', 'en', [1794, 3022]);
    expect(filters).toEqual([
      'name.ilike."%jjas%",artist_display.ilike."%jjas%",shabad_id.in.(1794,3022)',
    ]);
  });

  it('keeps a roman search working with nothing from BaniDB', async () => {
    const { client, filters } = fakeClient();
    await searchShabads(client, 'jag jivan', 'en', []);
    expect(filters).toEqual(['name.ilike."%jag jivan%",artist_display.ilike."%jag jivan%"']);
  });

  it('never holds Punjabi keystrokes against roman titles', async () => {
    const { client, filters } = fakeClient();
    await searchShabads(client, 'jjAs', 'pa', [1794]);
    expect(filters).toEqual(['name_gurmukhi.ilike."%jjAs%",shabad_id.in.(1794)']);
  });
});

describe('rankedSearchPage', () => {
  const rows = (n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${prefix}${i}`,
      name: 'x',
      url: 'https://example.test/a.mp3',
    }));
  const lineOf = (shabadId: number, atStart: boolean) => ({
    hit: { verseId: shabadId, shabadId },
    atStart,
  });
  const matches = {
    lines: [lineOf(1, true), lineOf(2, false)],
    partial: false,
  };

  function fakeClient(pages: unknown[][]) {
    const calls: { in?: unknown; or: string[]; from?: number; order: unknown[][] }[] = [];
    const client = {
      from: () => {
        const call: (typeof calls)[number] = { or: [], order: [] };
        calls.push(call);
        const result = { data: pages.shift() ?? [], error: null };
        const chain = {
          select: () => chain,
          range: (from: number) => ((call.from = from), chain),
          in: (_: string, ids: unknown) => ((call.in = ids), chain),
          or: (filter: string) => (call.or.push(filter), chain),
          order: (...args: unknown[]) => (call.order.push(args), chain),
          then: (resolve: (r: typeof result) => void) => resolve(result),
        };
        return chain;
      },
    } as unknown as KpClient;
    return { client, calls };
  }

  it('moves on to the rest in the same page once the openers run out', async () => {
    const { client, calls } = fakeClient([rows(2, 'open'), rows(1, 'rest')]);
    const page = await rankedSearchPage(client, 'hjb', 'pa', matches, {
      stage: 'opening',
      from: 0,
    });
    expect(page.items.map((i) => i.id)).toEqual(['open0', 'open1', 'rest0']);
    expect(page.next).toBeUndefined();
    expect(calls[0]?.in).toEqual([1]);
    // Everything else, without the openers, and without losing unlinked recordings.
    expect(calls[1]?.or).toEqual([
      'name_gurmukhi.ilike."%hjb%",shabad_id.in.(2)',
      'shabad_id.is.null,shabad_id.not.in.(1)',
    ]);
    // Most played first in both stages, with the id keeping pages stable.
    for (const call of calls) {
      expect(call.order[0]?.slice(0, 2)).toEqual(['play_count', { ascending: false }]);
      expect(call.order[1]?.[0]).toBe('id');
    }
  });

  it('stays with the openers while they fill a page', async () => {
    const { client, calls } = fakeClient([rows(PAGE_SIZE, 'open')]);
    const page = await rankedSearchPage(client, 'hjb', 'pa', matches, {
      stage: 'opening',
      from: 0,
    });
    expect(calls).toHaveLength(1);
    expect(page.next).toMatchObject({ stage: 'opening', from: PAGE_SIZE });
  });

  it('counts the rest from where its own pages reached', async () => {
    const { client, calls } = fakeClient([rows(PAGE_SIZE, 'rest')]);
    const page = await rankedSearchPage(client, 'hjb', 'pa', matches, {
      stage: 'rest',
      from: PAGE_SIZE,
    });
    expect(calls[0]?.from).toBe(PAGE_SIZE);
    expect(page.next).toMatchObject({ stage: 'rest', from: PAGE_SIZE * 2 });
  });

  it('goes straight to the rest when no line opens on the letters', async () => {
    const { client, calls } = fakeClient([rows(1, 'rest')]);
    await rankedSearchPage(
      client,
      'jag jivan',
      'en',
      { lines: [lineOf(2, false)], partial: false },
      { stage: 'opening', from: 0 }
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.in).toBeUndefined();
  });
});
