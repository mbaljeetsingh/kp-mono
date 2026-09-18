import { beforeEach, describe, expect, it } from 'vitest';

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
