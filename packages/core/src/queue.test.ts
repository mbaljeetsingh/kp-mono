import { describe, expect, it } from 'vitest';

import {
  onEnded,
  onNext,
  onPrevious,
  upNext,
  canShuffle,
  newToQueue,
  shuffleAction,
  type QueueState,
  shuffledQueue,
  unshuffledQueue,
} from './queue';
import type { Playable } from './types';

const item = (id: string): Playable => ({ id, title: id, url: `https://x/${id}` });

const three = (index: number, repeat: QueueState['repeat'] = 'off'): QueueState => ({
  items: [item('a'), item('b'), item('c')],
  index,
  repeat,
});

describe('onNext', () => {
  it('advances through the queue', () => {
    expect(onNext(three(0), false)).toEqual({ kind: 'play', index: 1 });
  });

  it('stops at the end — a shabad played from search has no follower', () => {
    expect(onNext(three(2), false)).toEqual({ kind: 'stop' });
  });

  it('wraps to the top under repeat-all', () => {
    expect(onNext(three(2, 'all'), false)).toEqual({ kind: 'play', index: 0 });
  });

  it('plays the first item when the cursor is still before the queue', () => {
    expect(onNext({ ...three(0), index: -1 }, false)).toEqual({ kind: 'play', index: 0 });
  });

  it('stops rather than advancing when a live stream drops', () => {
    // Switching to a broadcast keeps the queue, so a hiccup must not start
    // playing whatever was lined up.
    expect(onNext(three(0), true)).toEqual({ kind: 'stop' });
  });

  it('stops on an empty queue', () => {
    expect(onNext({ items: [], index: -1, repeat: 'off' }, false)).toEqual({ kind: 'stop' });
  });

  it('wraps a one-item queue onto itself under repeat-all', () => {
    expect(onNext({ items: [item('a')], index: 0, repeat: 'all' }, false)).toEqual({
      kind: 'play',
      index: 0,
    });
  });
});

describe('onEnded', () => {
  it('repeats the segment under repeat-one', () => {
    expect(onEnded(three(1, 'one'), false)).toEqual({ kind: 'restart' });
  });

  it('advances under every other mode', () => {
    expect(onEnded(three(1), false)).toEqual({ kind: 'play', index: 2 });
    expect(onEnded(three(1, 'all'), false)).toEqual({ kind: 'play', index: 2 });
  });

  it('never repeats a live stream, whose end is a dropped connection', () => {
    expect(onEnded(three(1, 'one'), true)).toEqual({ kind: 'stop' });
  });
});

describe('onPrevious', () => {
  it('restarts the current item when already underway', () => {
    expect(onPrevious(three(1), 10)).toEqual({ kind: 'restart' });
  });

  it('steps back when pressed again near the start', () => {
    expect(onPrevious(three(1), 1)).toEqual({ kind: 'play', index: 0 });
  });

  it('measures elapsed within the segment, not the file', () => {
    // A segment starting twelve minutes in would always read as past the
    // window if raw file position were used, making step-back unreachable.
    expect(onPrevious(three(1), 0)).toEqual({ kind: 'play', index: 0 });
  });

  it('does nothing off the front of a non-repeating queue', () => {
    expect(onPrevious(three(0), 0)).toEqual({ kind: 'none' });
  });

  it('wraps to the last item off the front under repeat-all', () => {
    expect(onPrevious(three(0, 'all'), 0)).toEqual({ kind: 'play', index: 2 });
  });

  it('ignores repeat-one, because a skip is the listener saying move on', () => {
    expect(onPrevious(three(0, 'one'), 0)).toEqual({ kind: 'none' });
  });
});

describe('upNext', () => {
  it('is everything after the cursor', () => {
    expect(upNext(three(0)).map((i) => i.id)).toEqual(['b', 'c']);
  });

  it('is the whole queue when nothing has played yet', () => {
    expect(upNext({ ...three(0), index: -1 }).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('is empty at the end', () => {
    expect(upNext(three(2))).toEqual([]);
  });
});

describe('shuffling', () => {
  const list = (...ids: string[]) => ids.map((id) => ({ id, title: id, url: `https://x/${id}` }));
  const ids = (items: { id: string }[]) => items.map((item) => item.id);

  it('shuffles only what follows the cursor', () => {
    const shuffled = shuffledQueue(list('a', 'b', 'c', 'd', 'e'), 1, () => 0);
    expect(ids(shuffled).slice(0, 2)).toEqual(['a', 'b']);
    expect(ids(shuffled).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(ids(shuffled)).not.toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('shuffles everything when nothing has played yet', () => {
    expect(ids(shuffledQueue(list('a', 'b'), -1, () => 0))).toEqual(['b', 'a']);
  });

  it('needs two items still to come', () => {
    const items = list('a', 'b', 'c');
    expect(canShuffle({ items, index: 0 })).toBe(true);
    expect(canShuffle({ items, index: 1 })).toBe(false);
    expect(canShuffle({ items, index: 2 })).toBe(false);
  });

  describe('shuffleAction', () => {
    const items = list('a', 'b', 'c');
    const state = (index: number, shuffleOrder: string[] | null = null) => ({
      items,
      index,
      shuffleOrder,
      current: items[index] ?? null,
    });

    it('reorders while two or more are to come', () => {
      expect(shuffleAction(state(0))).toBe('toggle');
    });

    it('fetches when too little is left to reorder', () => {
      expect(shuffleAction(state(1))).toBe('fetch');
      expect(shuffleAction(state(2))).toBe('fetch');
    });

    it('can still turn off once the list has shrunk', () => {
      expect(shuffleAction(state(2, ['a', 'b', 'c']))).toBe('toggle');
    });

    it('does nothing with nothing loaded, or on a broadcast', () => {
      expect(shuffleAction({ items: [], index: -1, shuffleOrder: null, current: null })).toBe(
        'none'
      );
      expect(shuffleAction({ ...state(2), current: { ...items[2]!, isLive: true } })).toBe('none');
    });
  });

  it('adds only what the queue does not already hold', () => {
    expect(ids(newToQueue(list('a', 'b'), list('b', 'c')))).toEqual(['c']);
  });

  it('keeps the cursor on the right copy of a recording queued twice', () => {
    const [a, b] = list('a', 'b');
    const restored = unshuffledQueue([a!, b!, a!], 2, ['a', 'b']);
    expect(ids(restored.items)).toEqual(['a', 'a', 'b']);
    expect(restored.index).toBe(1);
  });

  it('restores the order, with the cursor still on what is playing', () => {
    const restored = unshuffledQueue(list('c', 'a', 'b'), 0, ['a', 'b', 'c']);
    expect(ids(restored.items)).toEqual(['a', 'b', 'c']);
    expect(restored.index).toBe(2);
  });

  it('keeps later additions at the end and does not bring back removals', () => {
    const restored = unshuffledQueue(list('c', 'y', 'a', 'x'), 2, ['a', 'b', 'c']);
    expect(ids(restored.items)).toEqual(['a', 'c', 'y', 'x']);
    expect(restored.index).toBe(0);
  });
});
