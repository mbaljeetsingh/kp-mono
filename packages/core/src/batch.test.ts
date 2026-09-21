import { describe, expect, it } from 'vitest';

import { chunk, ID_BATCH } from './batch';

describe('chunk', () => {
  it('splits a long list into batches the query string can carry', () => {
    const batches = chunk(Array.from({ length: 250 }, (_, i) => i));
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(ID_BATCH);
    expect(batches[2]).toHaveLength(50);
  });

  it('leaves a short list as one batch', () => {
    expect(chunk([1, 2, 3])).toEqual([[1, 2, 3]]);
  });

  it('returns nothing for an empty list rather than one empty batch', () => {
    // An empty batch would become `in.()`, which PostgREST rejects.
    expect(chunk([])).toEqual([]);
  });

  it('splits exactly on the boundary without trailing an empty batch', () => {
    expect(chunk(Array.from({ length: ID_BATCH }, (_, i) => i))).toHaveLength(1);
  });
});
