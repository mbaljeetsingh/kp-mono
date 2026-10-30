import { describe, expect, it } from 'vitest';

import { shareUrl } from './share';
import type { Playable } from './types';

const item = { id: 'abc', title: 'T', url: 'u', startSec: 100, endSec: 400 } as Playable;
const origin = 'https://kirtanplayer.example';

describe('shareUrl', () => {
  it('starts from the top a few seconds in', () => {
    expect(shareUrl(item, 104, origin)).toBe(`${origin}/r/abc`);
  });

  it('carries seconds into the shabad, not into the file', () => {
    expect(shareUrl(item, 190, origin)).toBe(`${origin}/r/abc?t=90`);
  });

  it('rounds rather than floors, so a re-share does not creep a second early', () => {
    expect(shareUrl(item, 189.999, origin)).toBe(`${origin}/r/abc?t=90`);
  });
});
