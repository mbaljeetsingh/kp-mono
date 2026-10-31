import { describe, expect, it } from 'vitest';

import { parseRecentIds, RECENT_LIMIT, withRecent } from './recent';
import type { Playable } from './types';

const item = (id: string, extra: Partial<Playable> = { startSec: 10, endSec: 20 }): Playable => ({
  id,
  title: id,
  url: 'u',
  ...extra,
});

describe('withRecent', () => {
  it('puts the latest first and never lists one twice', () => {
    expect(withRecent(['a', 'b'], item('b'))).toEqual(['b', 'a']);
  });

  it('keeps only the most recent', () => {
    const full = Array.from({ length: RECENT_LIMIT }, (_, i) => String(i));
    const next = withRecent(full, item('new'));
    expect(next).toHaveLength(RECENT_LIMIT);
    expect(next[0]).toBe('new');
    expect(next).not.toContain(String(RECENT_LIMIT - 1));
  });

  it('ignores a broadcast and a raw file, which have no row to fetch back', () => {
    expect(withRecent(['a'], item('live', { isLive: true, startSec: 1 }))).toEqual(['a']);
    expect(withRecent(['a'], item('raw', {}))).toEqual(['a']);
  });
});

describe('parseRecentIds', () => {
  it('reads a stored list', () => {
    expect(parseRecentIds('["a","b"]')).toEqual(['a', 'b']);
  });

  it('reads nothing, bad JSON or the wrong shape as empty', () => {
    expect(parseRecentIds(null)).toEqual([]);
    expect(parseRecentIds('{nope')).toEqual([]);
    expect(parseRecentIds('{"a":1}')).toEqual([]);
  });

  it('drops entries that are not ids', () => {
    expect(parseRecentIds('["a",1,null]')).toEqual(['a']);
  });
});
