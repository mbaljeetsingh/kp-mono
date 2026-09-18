import { describe, expect, it } from 'vitest';

import {
  elapsedIn,
  hasReachedEnd,
  progressPct,
  seekTargetForPct,
  segmentEnd,
  segmentStart,
  segmentTotal,
  shouldRememberResume,
  startPositionFor,
} from './segment';
import type { Playable } from './types';

/** A tagged shabad: 45 seconds starting 42:10 into a long recording. */
const segment: Playable = {
  id: 's1',
  title: 'Segment',
  url: 'https://example.test/set.mp3',
  startSec: 2530,
  endSec: 2575,
};

/** An untagged recording — the whole file is the item. */
const whole: Playable = { id: 'w1', title: 'Whole', url: 'https://example.test/set.mp3' };

const live: Playable = { id: 'l1', title: 'Live', url: 'https://example.test/live', isLive: true };

describe('segment bounds', () => {
  it('treats an untagged item as starting at zero', () => {
    expect(segmentStart(whole)).toBe(0);
    expect(segmentStart(null)).toBe(0);
  });

  it('falls back to the file duration when nothing is tagged', () => {
    expect(segmentEnd(whole, 4200)).toBe(4200);
    expect(segmentEnd(segment, 4200)).toBe(2575);
  });
});

describe('elapsedIn', () => {
  it('reports time within the shabad, not within the file', () => {
    // 42:10 into the file is 0:00 of the shabad.
    expect(elapsedIn(segment, 2530)).toBe(0);
    expect(elapsedIn(segment, 2560)).toBe(30);
  });

  it('never goes negative when the file is parked before the segment', () => {
    expect(elapsedIn(segment, 10)).toBe(0);
  });
});

describe('segmentTotal', () => {
  it('is the segment length when tagged', () => {
    expect(segmentTotal(segment, 4200)).toBe(45);
  });

  it('is the file length when not', () => {
    expect(segmentTotal(whole, 4200)).toBe(4200);
  });
});

describe('progressPct', () => {
  it('measures across the segment, not the file', () => {
    expect(progressPct(segment, 2530, 4200)).toBe(0);
    expect(progressPct(segment, 2575, 4200)).toBe(100);
    expect(progressPct(segment, 2552.5, 4200)).toBeCloseTo(50);
  });

  it('clamps above 100 — a stale duration from the previous track divides out past it', () => {
    expect(progressPct(whole, 9000, 4200)).toBe(100);
  });

  it('clamps below zero', () => {
    expect(progressPct(segment, 0, 4200)).toBe(0);
  });

  it('returns zero rather than dividing by an unknown duration', () => {
    expect(progressPct(whole, 30, 0)).toBe(0);
  });
});

describe('seekTargetForPct', () => {
  it('maps a scrubber percentage onto the file clock', () => {
    expect(seekTargetForPct(segment, 0, 4200)).toBe(2530);
    expect(seekTargetForPct(segment, 50, 4200)).toBeCloseTo(2552.5);
  });

  it('stops just short of the end so dragging fully right does not skip the shabad', () => {
    expect(seekTargetForPct(segment, 100, 4200)).toBe(2574.5);
  });
});

describe('hasReachedEnd', () => {
  it('fires at and past the segment end', () => {
    expect(hasReachedEnd(segment, 2574)).toBe(false);
    expect(hasReachedEnd(segment, 2575)).toBe(true);
    expect(hasReachedEnd(segment, 2600)).toBe(true);
  });

  it('never fires for an untagged item — the file`s own end event handles that', () => {
    expect(hasReachedEnd(whole, 99999)).toBe(false);
  });
});

describe('shouldRememberResume', () => {
  it('remembers a mid-file position for untagged playback', () => {
    expect(shouldRememberResume(whole, 600, 4200)).toBe(true);
  });

  it('never remembers a segment — it always starts at its own offset', () => {
    expect(shouldRememberResume(segment, 2560, 4200)).toBe(false);
  });

  it('never remembers a live stream, whose position is meaningless later', () => {
    expect(shouldRememberResume(live, 600, 0)).toBe(false);
  });

  it('drops near-start and near-end positions', () => {
    expect(shouldRememberResume(whole, 20, 4200)).toBe(false);
    expect(shouldRememberResume(whole, 4180, 4200)).toBe(false);
  });
});

describe('startPositionFor', () => {
  it('prefers the segment offset over any saved resume', () => {
    expect(startPositionFor(segment, 900)).toBe(2530);
  });

  it('uses the resume position for whole-file playback', () => {
    expect(startPositionFor(whole, 900)).toBe(900);
  });

  it('starts at zero with neither', () => {
    expect(startPositionFor(whole)).toBe(0);
  });
});
