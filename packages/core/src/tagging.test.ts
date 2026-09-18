import { describe, expect, it } from 'vitest';

import {
  coverageOpen,
  untaggedGaps,
  untaggedSeconds,
  type TimelineSegment,
} from './tagging';

const seg = (id: string, start: number, end: number): TimelineSegment => ({
  id,
  start,
  end,
  name: id,
  published: true,
});

describe('coverageOpen', () => {
  it('keeps a recording open while more than five minutes is untagged', () => {
    expect(coverageOpen(600)).toBe(true);
    expect(coverageOpen(301)).toBe(true);
  });

  it('lets slack absorb the announcements at the top and the trail at the end', () => {
    expect(coverageOpen(300)).toBe(false);
    expect(coverageOpen(0)).toBe(false);
  });

  it('treats an unmeasurable recording as still open, never as done', () => {
    // NULL means no filename slot — all of puratan. A recording must not land
    // on Done because nobody can measure it.
    expect(coverageOpen(null)).toBe(true);
    expect(coverageOpen(undefined)).toBe(true);
  });
});

describe('untaggedGaps', () => {
  it('finds the holes between segments, longest first', () => {
    const gaps = untaggedGaps([seg('a', 100, 200), seg('b', 400, 500)], 1000);
    expect(gaps).toEqual([
      { start: 500, end: 1000 },
      { start: 200, end: 400 },
      { start: 0, end: 100 },
    ]);
  });

  it('ignores anything too short to be worth a contributor`s time', () => {
    expect(untaggedGaps([seg('a', 10, 200)], 210)).toEqual([]);
  });

  it('handles segments arriving out of order', () => {
    const gaps = untaggedGaps([seg('b', 400, 500), seg('a', 100, 200)], 500);
    expect(gaps).toEqual([
      { start: 200, end: 400 },
      { start: 0, end: 100 },
    ]);
  });

  it('never invents a gap from a segment nested inside another', () => {
    // b sits entirely within a. Tracking the previous segment's end rather
    // than the furthest end seen would put the cursor back at 200 and report
    // a phantom 100-second hole between 200 and 300.
    const gaps = untaggedGaps([seg('a', 0, 300), seg('b', 100, 200)], 400);
    expect(gaps).toEqual([{ start: 300, end: 400 }]);
  });

  it('reports the whole recording when nothing is tagged', () => {
    expect(untaggedGaps([], 600)).toEqual([{ start: 0, end: 600 }]);
  });
});

describe('untaggedSeconds', () => {
  it('counts what no segment covers', () => {
    expect(untaggedSeconds([seg('a', 100, 200)], 500)).toBe(400);
  });

  it('counts overlapping coverage once', () => {
    expect(untaggedSeconds([seg('a', 0, 300), seg('b', 100, 200)], 400)).toBe(100);
  });

  it('never goes negative when segments run past the stated duration', () => {
    expect(untaggedSeconds([seg('a', 0, 700)], 600)).toBe(0);
  });
});
