import { describe, expect, it } from 'vitest';

import {
  coverageOpen,
  coveredBy,
  gapAt,
  overlapping,
  sameShabadApart,
  stripSegment,
  untaggedGaps,
  markingWindow,
  untaggedSeconds,
  zoomWindow,
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

describe('overlapping', () => {
  const segments = [seg('a', 0, 100), seg('b', 200, 300)];

  it('finds a range that runs into an existing segment', () => {
    expect(overlapping(segments, { start: 50, end: 150 }).map((s) => s.id)).toEqual(['a']);
  });

  it('allows a range that sits cleanly in a gap', () => {
    expect(overlapping(segments, { start: 100, end: 200 })).toEqual([]);
  });

  it('treats touching boundaries as clear, not overlapping', () => {
    // One shabad ending exactly where the next begins is the normal case, not
    // a mistake worth warning about.
    expect(overlapping(segments, { start: 300, end: 400 })).toEqual([]);
  });

  it('ignores the segment being edited, which always overlaps itself', () => {
    expect(overlapping(segments, { start: 0, end: 100 }, 'a')).toEqual([]);
  });

  it('reports every segment a long range swallows', () => {
    expect(overlapping(segments, { start: 0, end: 500 }).map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('coveredBy', () => {
  const small = seg('small', 100, 160);

  it('takes a segment with most of its length inside', () => {
    expect(coveredBy([small], { start: 110, end: 500 }).map((s) => s.id)).toEqual(['small']);
  });

  it('leaves one the range only clips', () => {
    expect(coveredBy([small], { start: 150, end: 500 })).toEqual([]);
  });

  it('leaves one exactly half covered', () => {
    expect(coveredBy([small], { start: 130, end: 500 })).toEqual([]);
  });

  it('leaves a longer segment the range sits inside', () => {
    expect(coveredBy([seg('long', 0, 1000)], { start: 100, end: 200 })).toEqual([]);
  });

  it('takes a segment whose start the range clips when most of it is inside', () => {
    expect(coveredBy([small], { start: 50, end: 150 }).map((s) => s.id)).toEqual(['small']);
  });

  it('leaves one whose start the range clips by a little', () => {
    expect(coveredBy([small], { start: 0, end: 120 })).toEqual([]);
  });

  it('picks out the covered ones from several', () => {
    const near = seg('near', 200, 260);
    const far = seg('far', 400, 460);
    expect(coveredBy([small, near, far], { start: 90, end: 270 }).map((s) => s.id)).toEqual([
      'small',
      'near',
    ]);
  });
});

describe('stripSegment', () => {
  const a = seg('a', 100, 200);
  const b = seg('b', 200, 300);
  const far = seg('far', 1000, 1100);

  it('follows the playhead into a segment', () => {
    expect(stripSegment([a, far], 150, null)).toBe('a');
  });

  it('stays on a segment whose end cut was just played', () => {
    // Playing from the end runs out of the segment at once.
    expect(stripSegment([a, far], 200, 'a')).toBe('a');
    expect(stripSegment([a, far], 210, 'a')).toBe('a');
  });

  it('lets go once the playhead is well clear of it', () => {
    expect(stripSegment([a, far], 400, 'a')).toBeNull();
    expect(stripSegment([a, far], 400, null)).toBeNull();
  });

  it('moves to a neighbour the playhead enters, hold or not', () => {
    expect(stripSegment([a, b], 205, 'a')).toBe('b');
  });

  it('keeps a segment with unsaved edits wherever the playhead goes', () => {
    expect(stripSegment([a, b, far], 1050, 'far', 'a')).toBe('a');
  });

  it('ignores a pin on a segment that is gone', () => {
    expect(stripSegment([a], 150, null, 'deleted')).toBe('a');
  });

  it('prefers the held segment where two overlap, else the inner one', () => {
    const outer = seg('outer', 0, 500);
    const inner = seg('inner', 100, 200);
    expect(stripSegment([outer, inner], 150, 'outer')).toBe('outer');
    expect(stripSegment([outer, inner], 150, null)).toBe('inner');
  });
});

describe('gapAt', () => {
  it('runs from the cut before to the cut after', () => {
    expect(gapAt([seg('a', 100, 200), seg('b', 400, 500)], 1000, 300)).toEqual({
      start: 200,
      end: 400,
    });
  });

  it('runs to the recording’s own ends', () => {
    expect(gapAt([seg('a', 100, 200)], 1000, 50)).toEqual({ start: 0, end: 100 });
    expect(gapAt([seg('a', 100, 200)], 1000, 900)).toEqual({ start: 200, end: 1000 });
  });
});

describe('zoomWindow', () => {
  it('pads a short cut by the minimum', () => {
    expect(zoomWindow({ start: 100, end: 140 }, 1000, 30)).toEqual({ start: 70, end: 170 });
  });
  it('pads a long cut by half its length', () => {
    expect(zoomWindow({ start: 100, end: 200 }, 1000, 30)).toEqual({ start: 50, end: 250 });
  });
  it('stays inside the recording', () => {
    expect(zoomWindow({ start: 10, end: 990 }, 1000, 30)).toEqual({ start: 0, end: 1000 });
  });
});

describe('markingWindow', () => {
  it('shows 20 minutes from the start', () => {
    expect(markingWindow(600, 700, 10_000, 30)).toEqual({ start: 570, end: 1800 });
  });
  it('grows 5 minutes once the playhead is within a minute of the end', () => {
    expect(markingWindow(600, 1750, 10_000, 30)).toEqual({ start: 570, end: 2100 });
    expect(markingWindow(600, 2100, 10_000, 30)).toEqual({ start: 570, end: 2400 });
  });
  it('stays inside the recording', () => {
    expect(markingWindow(10, 9_990, 10_000, 30)).toEqual({ start: 0, end: 10_000 });
  });
});

describe('sameShabadApart', () => {
  const seg = (id: string, start: number, end: number, shabadId: number | null) => ({
    id,
    name: id,
    start,
    end,
    published: false,
    shabadId,
  });

  it('finds the same shabad at a separate time, and not the segment itself', () => {
    const a = seg('a', 0, 100, 7);
    const segments = [a, seg('b', 200, 300, 7), seg('c', 400, 500, 8)];
    expect(sameShabadApart(segments, a).map((s) => s.id)).toEqual(['b']);
  });

  it('leaves out one lying over it, which is an overlap', () => {
    const a = seg('a', 0, 100, 7);
    expect(sameShabadApart([a, seg('b', 50, 150, 7)], a)).toEqual([]);
  });

  it('matches nothing without a shabad', () => {
    const a = seg('a', 0, 100, null);
    expect(sameShabadApart([a, seg('b', 200, 300, null)], a)).toEqual([]);
  });
});
