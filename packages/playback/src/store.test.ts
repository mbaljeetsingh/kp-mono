import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Playable } from '@kp/core';

import type { AudioDriver } from './driver';
import { memoryStorage } from './memory-storage';
import { createPlayerStore } from './store';

/** Records what the store asked for, so intent can be asserted without sound. */
function fakeDriver() {
  const calls: string[] = [];
  const driver: AudioDriver = {
    load: (url, at) => calls.push(`load ${url}@${at}`),
    play: () => calls.push('play'),
    pause: () => calls.push('pause'),
    seek: (s) => calls.push(`seek ${s}`),
  };
  return { driver, calls };
}

const segment = (id: string, start: number, end: number): Playable => ({
  id,
  title: id,
  url: `https://x/${id}.mp3`,
  startSec: start,
  endSec: end,
});

const whole = (id: string): Playable => ({ id, title: id, url: `https://x/${id}.mp3` });

let store: ReturnType<typeof createPlayerStore>;
let fake: ReturnType<typeof fakeDriver>;

beforeEach(() => {
  fake = fakeDriver();
  store = createPlayerStore({ storage: memoryStorage() });
  store.getState().attach(fake.driver);
});

describe('swapCurrent', () => {
  it('puts the other recording in place, so what was next stays next', () => {
    store.getState().playList([segment('a', 0, 10), segment('b', 0, 10), segment('c', 0, 10)], 1);
    store.getState().swapCurrent(segment('b2', 50, 60));
    expect(store.getState().items.map((i) => i.id)).toEqual(['a', 'b2', 'c']);
    expect(store.getState().index).toBe(1);
    expect(store.getState().current?.id).toBe('b2');
    expect(fake.calls.at(-2)).toBe('load https://x/b2.mp3@50');
  });

  it('does not leave the recording queued a second time', () => {
    store.getState().playList([segment('a', 0, 10), segment('b', 0, 10), segment('c', 0, 10)], 0);
    store.getState().swapCurrent(segment('b', 0, 10));
    expect(store.getState().items.map((i) => i.id)).toEqual(['b', 'c']);
    expect(store.getState().index).toBe(0);
  });

  it('plays it outright with nothing loaded', () => {
    store.getState().swapCurrent(segment('a', 0, 10));
    expect(store.getState().current?.id).toBe('a');
  });
});

describe('recently played', () => {
  it('remembers what starts, latest first, across a restart', async () => {
    const storage = memoryStorage();
    const first = createPlayerStore({ storage });
    await first.getState().hydrate();
    first.getState().play(segment('a', 0, 10));
    first.getState().play(segment('b', 0, 10));
    expect(first.getState().recentIds).toEqual(['b', 'a']);

    const second = createPlayerStore({ storage });
    await second.getState().hydrate();
    expect(second.getState().recentIds).toEqual(['b', 'a']);
  });

  it('keeps the saved list when a play starts before storage is read', async () => {
    const storage = memoryStorage();
    await storage.setItem('kp:recent', JSON.stringify(['old']));
    const early = createPlayerStore({ storage });
    early.getState().play(segment('a', 0, 10));
    expect(await storage.getItem('kp:recent')).toBe(JSON.stringify(['old']));

    await early.getState().hydrate();
    expect(early.getState().recentIds).toEqual(['a', 'old']);
    expect(await storage.getItem('kp:recent')).toBe(JSON.stringify(['a', 'old']));
  });

  it('does not count a shared link that was only cued', () => {
    store.getState().cue(segment('a', 0, 10), 0);
    expect(store.getState().recentIds).toEqual([]);
  });
});

describe('play', () => {
  it('starts a segment at its own offset, not the file`s', () => {
    store.getState().play(segment('a', 2530, 2575));
    expect(fake.calls).toEqual(['load https://x/a.mp3@2530', 'play']);
    expect(store.getState().current?.id).toBe('a');
  });

  it('replaces the queue by default and appends when told not to', () => {
    store.getState().play(whole('a'));
    store.getState().play(whole('b'), false);
    expect(store.getState().items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(store.getState().index).toBe(1);
  });
});

describe('segment end', () => {
  it('advances the queue itself — no driver reports `ended` mid-file', () => {
    store.getState().play(segment('a', 60, 105));
    store.getState().addToQueue(segment('b', 200, 240));
    fake.calls.length = 0;

    store.getState().onStatus({ position: 105, duration: 372, playing: true });

    expect(fake.calls).toContain('load https://x/b.mp3@200');
    expect(store.getState().current?.id).toBe('b');
  });

  it('does not advance before the boundary', () => {
    store.getState().play(segment('a', 60, 105));
    store.getState().addToQueue(segment('b', 200, 240));
    fake.calls.length = 0;

    store.getState().onStatus({ position: 104.9, duration: 372, playing: true });

    expect(fake.calls).toEqual([]);
    expect(store.getState().current?.id).toBe('a');
  });

  it('restarts the segment under repeat-one', () => {
    store.getState().play(segment('a', 60, 105));
    store.getState().cycleRepeat(); // all
    store.getState().cycleRepeat(); // one
    store.getState().onStatus({ position: 70, duration: 372, playing: true });
    fake.calls.length = 0;

    store.getState().onStatus({ position: 105, duration: 372, playing: true });

    expect(fake.calls).toContain('seek 60');
    expect(store.getState().current?.id).toBe('a');
  });

  it('stops at the end of a queue with nothing following', () => {
    store.getState().play(segment('a', 60, 105));
    fake.calls.length = 0;

    store.getState().onStatus({ position: 105, duration: 372, playing: true });

    expect(fake.calls).toEqual(['pause']);
    expect(store.getState().playing).toBe(false);
  });
});

describe('previous', () => {
  it('restarts the current segment when underway', () => {
    store.getState().play(segment('a', 60, 105));
    store.getState().onStatus({ position: 90, duration: 372, playing: true });
    fake.calls.length = 0;

    store.getState().previous();

    expect(fake.calls).toContain('seek 60');
  });

  it('steps back when pressed near the segment start', () => {
    store.getState().play(whole('a'));
    store.getState().addToQueue(whole('b'));
    store.getState().playAt(1);
    store.getState().onStatus({ position: 1, duration: 372, playing: true });
    fake.calls.length = 0;

    store.getState().previous();

    expect(fake.calls).toContain('load https://x/a.mp3@0');
  });
});

describe('resume positions', () => {
  it('remembers a mid-file position for whole-file playback', async () => {
    const storage = memoryStorage();
    const s = createPlayerStore({ storage });
    s.getState().attach(fake.driver);
    s.getState().play(whole('a'));

    s.getState().onStatus({ position: 600, duration: 4200, playing: true });

    expect(await storage.getItem('kp:resume')).toContain('600');
  });

  it('never remembers a segment, which always starts at its own offset', async () => {
    const storage = memoryStorage();
    const s = createPlayerStore({ storage });
    s.getState().attach(fake.driver);
    s.getState().play(segment('a', 60, 105));

    s.getState().onStatus({ position: 90, duration: 372, playing: true });

    expect(await storage.getItem('kp:resume')).toBeNull();
  });
});

describe('hydrate', () => {
  it('restores the queue but never starts playing', async () => {
    const storage = memoryStorage({
      'kp:queue': JSON.stringify({ items: [whole('a'), whole('b')], index: 1 }),
      'kp:repeat': 'all',
    });
    const s = createPlayerStore({ storage });
    s.getState().attach(fake.driver);

    await s.getState().hydrate();

    expect(s.getState().current?.id).toBe('b');
    expect(s.getState().repeat).toBe('all');
    expect(s.getState().playing).toBe(false);
    expect(fake.calls).not.toContain('play');
  });

  it('treats a corrupt queue as an empty one', async () => {
    const s = createPlayerStore({ storage: memoryStorage({ 'kp:queue': '{oh no' }) });
    s.getState().attach(fake.driver);
    await s.getState().hydrate();
    expect(s.getState().items).toEqual([]);
  });

  it('does not restore over something cued while storage was being read', async () => {
    const storage = memoryStorage({
      'kp:queue': JSON.stringify({ items: [whole('old')], index: 0 }),
      'kp:repeat': 'all',
    });
    const s = createPlayerStore({ storage });
    s.getState().attach(fake.driver);

    const pending = s.getState().hydrate();
    s.getState().cue(segment('linked', 60, 105), 90);
    await pending;

    expect(s.getState().current?.id).toBe('linked');
    expect(s.getState().position).toBe(90);
    expect(s.getState().repeat).toBe('all');
    expect(fake.calls).not.toContain('load https://x/old.mp3@0');
  });
});

describe('starting', () => {
  it('stops when the listener pauses during a skip', () => {
    store.getState().play(whole('a'));
    store.getState().onStatus({ position: 1, duration: 10, playing: true });
    store.getState().play(whole('b'));
    store.getState().toggle();
    expect(store.getState().playing).toBe(false);
    expect(store.getState().starting).toBeNull();
  });

  it('runs while a cued item is resumed, until it plays', () => {
    store.getState().cue(whole('a'), 5);
    store.getState().toggle();
    expect(store.getState().starting).toBe('a');
    store.getState().onStatus({ position: 5, duration: 10, playing: true });
    expect(store.getState().starting).toBeNull();
  });

  it('gives up when tapped again while connecting', () => {
    store.getState().play(whole('a'));
    store.getState().toggle();
    expect(store.getState().starting).toBeNull();
    expect(fake.calls.at(-1)).toBe('pause');
  });

  it('reconnects a paused broadcast rather than resuming its old buffer', () => {
    const live = { ...whole('live'), isLive: true };
    store.getState().play(live);
    store.getState().onStatus({ position: 1, duration: 0, playing: true });
    store.getState().toggle();
    store.getState().onStatus({ position: 1, duration: 0, playing: false });
    fake.calls.length = 0;
    store.getState().toggle();
    expect(fake.calls).toEqual(['load https://x/live.mp3@0', 'play']);
    expect(store.getState().starting).toBe('live');
  });

  it('stops when the item being started is cued instead', () => {
    store.getState().play(whole('a'));
    store.getState().cue(whole('a'), 5);
    expect(store.getState().starting).toBeNull();
  });

  it('gives up on a file that never plays, so the button stops spinning', () => {
    vi.useFakeTimers();
    try {
      store.getState().play(whole('a'));
      expect(store.getState().starting).toBe('a');
      vi.advanceTimersByTime(15_000);
      expect(store.getState().starting).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not let the last attempt end the next one early', () => {
    vi.useFakeTimers();
    try {
      store.getState().play(whole('a'));
      vi.advanceTimersByTime(10_000);
      store.getState().play(whole('b'));
      vi.advanceTimersByTime(10_000);
      expect(store.getState().starting).toBe('b');
      vi.advanceTimersByTime(5_000);
      expect(store.getState().starting).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('cue', () => {
  it('loads the item at the given position without playing it', () => {
    store.getState().cue(segment('a', 60, 105), 90);
    expect(fake.calls).toEqual(['pause', 'load https://x/a.mp3@90']);
    expect(store.getState().current?.id).toBe('a');
    expect(store.getState().position).toBe(90);
    expect(store.getState().playing).toBe(false);
    expect(store.getState().starting).toBeNull();
  });

  it('replaces the queue, and toggle then plays from where it was cued', () => {
    store.getState().play(whole('x'));
    store.getState().cue(segment('a', 60, 105), 90);
    expect(store.getState().items.map((i) => i.id)).toEqual(['a']);
    fake.calls.length = 0;

    store.getState().toggle();

    expect(fake.calls).toEqual(['play']);
  });
});

describe('queue edits', () => {
  it('keeps the cursor on the same item when something above it is removed', () => {
    store.getState().play(whole('a'));
    store.getState().addToQueue(whole('b'));
    store.getState().addToQueue(whole('c'));
    store.getState().playAt(2);

    store.getState().removeAt(0);

    expect(store.getState().index).toBe(1);
    expect(store.getState().current?.id).toBe('c');
  });

  it('drops line timings when persisting, so a stale alignment cannot be pinned', async () => {
    const storage = memoryStorage();
    const s = createPlayerStore({ storage });
    s.getState().attach(fake.driver);
    s.getState().addToQueue({ ...whole('a'), lineTimings: [{ verse_id: 1, start: 0, end: 2 }] });

    expect(await storage.getItem('kp:queue')).not.toContain('lineTimings');
  });
});

describe('titles in the chosen script', () => {
  it('loads an item under the title the app picks, and re-announces it on retitle', () => {
    let script = 'en';
    const announced: string[] = [];
    const titles = createPlayerStore({
      storage: memoryStorage(),
      titleOf: (item) => (script === 'pa' ? `ਪੰ ${item.title}` : item.title),
    });
    const loaded: string[] = [];
    titles.getState().attach({
      load: (_url, _at, now) => loaded.push(now?.title ?? ''),
      play: () => {},
      pause: () => {},
      seek: () => {},
      announce: (now) => announced.push(now.title),
    });

    titles.getState().play(whole('a'));
    expect(loaded).toEqual(['a']);

    // Switched mid-shabad: the lock screen hears the new title, nothing reloads.
    script = 'pa';
    titles.getState().retitle();
    expect(announced).toEqual(['ਪੰ a']);
    expect(loaded).toEqual(['a']);
  });

  it('does nothing with nothing playing, or a driver that cannot announce', () => {
    store.getState().retitle();
    store.getState().play(whole('a'));
    fake.calls.length = 0;
    store.getState().retitle();
    expect(fake.calls).toEqual([]);
  });
});

describe('canPlay', () => {
  const a = segment('a', 0, 10);
  const b = segment('b', 0, 10);
  const c = segment('c', 0, 10);

  function offlineWith(...kept: string[]) {
    const fake = fakeDriver();
    const offline = createPlayerStore({
      storage: memoryStorage(),
      canPlay: (item) => kept.includes(item.id),
    });
    offline.getState().attach(fake.driver);
    return { offline, fake };
  }

  it('starts nothing and leaves the queue alone for an item it cannot play', () => {
    const { offline, fake } = offlineWith('a');
    offline.getState().playList([a, b], 0);
    fake.calls.length = 0;
    offline.getState().playList([b, c], 0);
    offline.getState().play(b);
    expect(fake.calls).toEqual([]);
    expect(offline.getState().current).toBe(a);
    expect(offline.getState().items).toEqual([a, b]);
  });

  it('skips forward past what it cannot play', () => {
    const { offline } = offlineWith('a', 'c');
    offline.getState().playList([a, b, c], 0);
    offline.getState().next();
    expect(offline.getState().current).toBe(c);
    expect(offline.getState().index).toBe(2);
  });

  it('skips backward past what it cannot play', () => {
    const { offline } = offlineWith('a', 'c');
    offline.getState().playList([a, b, c], 2);
    offline.getState().previous();
    expect(offline.getState().current).toBe(a);
  });

  it('keeps playing when Next finds nothing it can play', () => {
    const { offline, fake } = offlineWith('a');
    offline.getState().playList([a, b], 0);
    offline.getState().next();
    expect(offline.getState().current).toBe(a);
    expect(fake.calls).not.toContain('pause');
  });

  it('stops when the item runs out and nothing further along can play', () => {
    const { offline, fake } = offlineWith('a');
    offline.getState().playList([a, b], 0);
    offline.getState().onStatus({ position: 10, duration: 100, playing: true });
    expect(offline.getState().current).toBe(a);
    expect(fake.calls.at(-1)).toBe('pause');
  });
});

describe('setRecent', () => {
  it('replaces the list and survives a reload', async () => {
    const storage = memoryStorage();
    const first = createPlayerStore({ storage });
    await first.getState().hydrate();
    expect(first.getState().recentReady).toBe(true);
    first.getState().setRecent(['x', 'y']);

    const second = createPlayerStore({ storage });
    expect(second.getState().recentReady).toBe(false);
    await second.getState().hydrate();
    expect(second.getState().recentIds).toEqual(['x', 'y']);
  });
});

describe('shuffle', () => {
  const list = ['a', 'b', 'c', 'd', 'e'].map(whole);
  const ids = (items: Playable[]) => items.map((item) => item.id);

  function playing(index = 2) {
    const store = createPlayerStore({ storage: memoryStorage() });
    const { driver, calls } = fakeDriver();
    store.getState().attach(driver);
    store.getState().playList(list, index);
    calls.length = 0;
    return { store, calls };
  }

  it('reorders what is to come, without touching the audio or what is behind', () => {
    const { store, calls } = playing(1);
    store.getState().toggleShuffle();
    const s = store.getState();
    expect(s.current?.id).toBe('b');
    expect(s.index).toBe(1);
    expect(ids(s.items).slice(0, 2)).toEqual(['a', 'b']);
    expect(ids(s.items).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(calls).toEqual([]);
  });

  it('adds random shabads behind the list, without touching the audio', () => {
    const { store, calls } = playing(4);
    const before = ids(store.getState().items);
    store.getState().addRandomToQueue([
      { ...store.getState().items[0]!, id: 'z' },
      { ...store.getState().items[4]!, id: 'e' },
    ]);
    const s = store.getState();
    expect(s.current?.id).toBe('e');
    expect(s.index).toBe(4);
    expect(ids(s.items)).toEqual([...before, 'z']);
    expect(calls).toEqual([]);
  });

  it('can still be turned off once the list has shrunk', () => {
    const { store } = playing(0);
    store.getState().toggleShuffle();
    while (store.getState().items.length > 1) store.getState().removeAt(1);
    store.getState().toggleShuffle();
    expect(store.getState().shuffleOrder).toBeNull();
  });

  it('puts the order back when turned off', () => {
    const { store, calls } = playing();
    store.getState().toggleShuffle();
    store.getState().next();
    const playingNow = store.getState().current?.id;
    calls.length = 0;
    store.getState().toggleShuffle();
    const s = store.getState();
    expect(ids(s.items)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(s.items[s.index]?.id).toBe(playingNow);
    expect(s.shuffleOrder).toBeNull();
    expect(calls).toEqual([]);
  });

  it('leaves a list of one, the last item and a broadcast alone', () => {
    const atEnd = playing(4).store;
    atEnd.getState().toggleShuffle();
    expect(atEnd.getState().shuffleOrder).toBeNull();

    const store = createPlayerStore({ storage: memoryStorage() });
    store.getState().play(whole('a'));
    store.getState().toggleShuffle();
    expect(store.getState().shuffleOrder).toBeNull();

    const live = { ...whole('live'), isLive: true };
    store.getState().playList([live, whole('b')], 0);
    store.getState().toggleShuffle();
    expect(store.getState().shuffleOrder).toBeNull();
  });

  it('ends when a new list starts', () => {
    const { store } = playing();
    store.getState().toggleShuffle();
    store.getState().playList(list, 0);
    expect(store.getState().shuffleOrder).toBeNull();
    expect(ids(store.getState().items)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it("keeps a swapped recording in the old one's place in the order", () => {
    const { store } = playing();
    store.getState().toggleShuffle();
    store.getState().swapCurrent(whole('c2'));
    store.getState().toggleShuffle();
    expect(ids(store.getState().items)).toEqual(['a', 'b', 'c2', 'd', 'e']);
  });

  it('survives a restart', async () => {
    const storage = memoryStorage();
    const first = createPlayerStore({ storage });
    first.getState().playList(list, 2);
    first.getState().toggleShuffle();
    const order = ids(first.getState().items);

    const second = createPlayerStore({ storage });
    await second.getState().hydrate();
    expect(ids(second.getState().items)).toEqual(order);
    second.getState().toggleShuffle();
    expect(ids(second.getState().items)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(second.getState().current?.id).toBe('c');
  });
});
