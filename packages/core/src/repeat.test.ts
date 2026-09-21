import { describe, expect, it } from 'vitest';

import { nextRepeatMode, parseRepeatMode, REPEAT_LABELS, REPEAT_MODES } from './repeat';

describe('nextRepeatMode', () => {
  it('cycles off → all → one → off', () => {
    expect(nextRepeatMode('off')).toBe('all');
    expect(nextRepeatMode('all')).toBe('one');
    expect(nextRepeatMode('one')).toBe('off');
  });
});

describe('parseRepeatMode', () => {
  it("reads the two-state version's '1' as repeat-one", () => {
    expect(parseRepeatMode('1')).toBe('one');
  });

  it('accepts the current vocabulary', () => {
    expect(parseRepeatMode('all')).toBe('all');
    expect(parseRepeatMode('one')).toBe('one');
    expect(parseRepeatMode('off')).toBe('off');
  });

  it('falls back to off for anything unrecognised or absent', () => {
    expect(parseRepeatMode('nonsense')).toBe('off');
    expect(parseRepeatMode(null)).toBe('off');
  });
});

describe('labels', () => {
  it('names every mode, so no surface has to invent one', () => {
    for (const mode of REPEAT_MODES) {
      expect(REPEAT_LABELS[mode]).toBeTruthy();
    }
  });
});
