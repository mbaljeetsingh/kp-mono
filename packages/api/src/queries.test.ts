import { describe, expect, it } from 'vitest';

import type { KpClient } from './client';
import { ilikePattern, shabadsByIds } from './queries';

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
