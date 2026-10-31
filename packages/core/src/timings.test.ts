import { describe, expect, it } from 'vitest';

import { highlightVerseId, isAligned, lineAt, lineMarkPcts } from './timings';
import type { LineTiming, Playable } from './types';

/**
 * Sparse on purpose: the gap between 12 and 20 is alaap, where nothing is being
 * sung. "No line right now" is a correct answer there, not a missing one.
 */
const timings: LineTiming[] = [
  { verse_id: 101, start: 5, end: 12 },
  { verse_id: 102, start: 20, end: 28 },
];

const aligned: Playable = {
  id: 'a',
  title: 'Aligned',
  url: 'u',
  mainVerseId: 999,
  lineTimings: timings,
};

const tagged: Playable = { id: 't', title: 'Tagged only', url: 'u', mainVerseId: 999 };

describe('lineAt', () => {
  it('finds the line being sung', () => {
    expect(lineAt(timings, 6)?.verse_id).toBe(101);
    expect(lineAt(timings, 24)?.verse_id).toBe(102);
  });

  it('is inclusive of start and exclusive of end', () => {
    expect(lineAt(timings, 5)?.verse_id).toBe(101);
    expect(lineAt(timings, 12)).toBeNull();
  });

  it('returns null in a gap, before the first line, and after the last', () => {
    expect(lineAt(timings, 15)).toBeNull();
    expect(lineAt(timings, 0)).toBeNull();
    expect(lineAt(timings, 99)).toBeNull();
  });

  it('handles a rendition that was never aligned', () => {
    expect(lineAt(null, 10)).toBeNull();
    expect(lineAt(undefined, 10)).toBeNull();
  });
});

describe('highlightVerseId', () => {
  it('follows the singing when the rendition is aligned', () => {
    expect(highlightVerseId(aligned, 6)).toBe(101);
    expect(highlightVerseId(aligned, 24)).toBe(102);
  });

  it('lights nothing during alaap rather than falling back to the tagged line', () => {
    expect(highlightVerseId(aligned, 15)).toBeNull();
  });

  it('holds the tagged line for the rest of the archive', () => {
    expect(highlightVerseId(tagged, 15)).toBe(999);
    expect(highlightVerseId(tagged, 9999)).toBe(999);
  });
});

describe('isAligned', () => {
  it('distinguishes aligned renditions from merely tagged ones', () => {
    expect(isAligned(aligned)).toBe(true);
    expect(isAligned(tagged)).toBe(false);
    expect(isAligned(null)).toBe(false);
  });
});

describe('lineMarkPcts', () => {
  const item = (lineTimings: LineTiming[] | null, startSec = 100, endSec = 200): Playable => ({
    id: 'a',
    title: 'Aligned',
    url: 'u',
    startSec,
    endSec,
    lineTimings,
  });
  const line = (start: number): LineTiming => ({ verse_id: 1, start, end: start + 1 });

  it('places each line within the segment, not the file', () => {
    expect(lineMarkPcts(item([line(110), line(150)]), 3000)).toEqual([10, 50]);
  });

  it('marks a refrain every time it returns, in sung order', () => {
    expect(lineMarkPcts(item([line(150), line(110), line(180)]), 3000)).toEqual([10, 50, 80]);
  });

  it('drops a line too close to the one before it', () => {
    expect(lineMarkPcts(item([line(110), line(110.5), line(112)]), 3000)).toEqual([10, 12]);
  });

  it('leaves out timings outside the segment', () => {
    expect(lineMarkPcts(item([line(50), line(150), line(250)]), 3000)).toEqual([50]);
  });

  it('is empty with nothing to mark or no length yet', () => {
    expect(lineMarkPcts(item(null), 3000)).toEqual([]);
    expect(lineMarkPcts(null, 3000)).toEqual([]);
    expect(lineMarkPcts({ id: 'a', title: 'A', url: 'u', lineTimings: [line(5)] }, 0)).toEqual([]);
  });
});
