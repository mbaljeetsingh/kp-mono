import { describe, expect, it } from 'vitest';

import { segmentStart, hasReachedEnd } from './segment';
import { toPlayable, type RenditionRow } from './rows';

const base: RenditionRow = {
  id: 'r1',
  name: 'Sorath Mahala 5',
  url: 'https://example.test/set.mp3',
};

describe('toPlayable', () => {
  it('maps a tagged segment', () => {
    const p = toPlayable({ ...base, start_sec: 2530, end_sec: 2575 });
    expect(p.startSec).toBe(2530);
    expect(p.endSec).toBe(2575);
  });

  it('accepts numeric strings, which is how numeric columns arrive over PostgREST', () => {
    const p = toPlayable({ ...base, start_sec: '2530', end_sec: '2575' });
    expect(p.startSec).toBe(2530);
    expect(p.endSec).toBe(2575);
  });

  it('leaves the bounds undefined for an untagged recording', () => {
    // Not NaN: Playable means "this is a segment" by the presence of these
    // fields, and NaN survives every `??` downstream while failing silently.
    const p = toPlayable(base);
    expect(p.startSec).toBeUndefined();
    expect(p.endSec).toBeUndefined();
  });

  it('keeps an untagged recording playable from the top and never self-ends', () => {
    const p = toPlayable(base);
    expect(segmentStart(p)).toBe(0);
    expect(hasReachedEnd(p, 99999)).toBe(false);
  });

  it('treats null bounds the same as absent ones', () => {
    const p = toPlayable({ ...base, start_sec: null, end_sec: null });
    expect(p.startSec).toBeUndefined();
    expect(p.endSec).toBeUndefined();
  });

  it('prefers the display name for the subtitle but keeps the raw artist', () => {
    const p = toPlayable({ ...base, artist: 'Bhai Gurwinder Singh', artist_display: 'Anandpuri' });
    expect(p.subtitle).toBe('Anandpuri');
    expect(p.artist).toBe('Bhai Gurwinder Singh');
  });

  it('accepts timings only as an array', () => {
    expect(
      toPlayable({ ...base, line_timings: [{ verse_id: 1, start: 0, end: 2 }] }).lineTimings
    ).toHaveLength(1);
    expect(toPlayable({ ...base, line_timings: '[]' }).lineTimings).toBeNull();
    expect(toPlayable({ ...base, line_timings: null }).lineTimings).toBeNull();
    expect(toPlayable(base).lineTimings).toBeNull();
  });
});
