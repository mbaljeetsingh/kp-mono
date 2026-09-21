/**
 * The player, as state plus intent.
 *
 * Zustand rather than React Context, deliberately. `usePlayer.ts` uses
 * module-level Vue refs because there is exactly one audio element app-wide,
 * and the naive port of that is Context — which re-renders every consumer on
 * any change. At a 100ms status interval that is the whole subtree, ten times
 * a second, forever. A store with selector subscriptions keeps it to the seek
 * bar and the lyrics panel.
 *
 * Every rule worth arguing about — what follows this item, where a segment
 * ends, whether a position is worth remembering — lives in @kp/core as a pure
 * function. This file decides nothing; it carries decisions out.
 */
import {
  hasReachedEnd,
  onEnded,
  onNext,
  onPrevious,
  parseRepeatMode,
  segmentStart,
  shouldRememberResume,
  startPositionFor,
  elapsedIn,
  nextRepeatMode,
  type Playable,
  type QueueState,
  type RepeatMode,
} from '@kp/core';
import { createStore } from 'zustand/vanilla';

import type { AudioDriver, DriverStatus, NowPlaying, PlayerStorage } from './driver';

const QUEUE_KEY = 'kp:queue';
const REPEAT_KEY = 'kp:repeat';
const RESUME_KEY = 'kp:resume';

export interface PlayerState {
  current: Playable | null;
  items: Playable[];
  index: number;
  repeat: RepeatMode;
  playing: boolean;
  /** Absolute seconds on the file's clock. Segment-relative views derive. */
  position: number;
  duration: number;
  /** True between asking for an item and the driver reporting it playing. */
  starting: string | null;

  attach(driver: AudioDriver): void;
  hydrate(): Promise<void>;

  /** Called by the driver on its own interval. */
  onStatus(status: DriverStatus): void;

  play(item: Playable, replaceQueue?: boolean): void;
  /** Load a whole shelf as the queue and start at one of its rows. */
  playList(items: Playable[], index: number): void;
  playAt(index: number): void;
  toggle(): void;
  next(): void;
  previous(): void;
  seek(seconds: number): void;
  addToQueue(item: Playable): void;
  removeAt(index: number): void;
  clearQueue(): void;
  cycleRepeat(): void;
}

export interface PlayerStoreOptions {
  storage: PlayerStorage;
  /**
   * Where a rendition's artwork actually lives.
   *
   * Taken as a function because the store has no business knowing about
   * Supabase storage paths, and the two apps resolve them differently. Omitted,
   * the lock screen simply shows no art — which is what it did before any of
   * this existed.
   */
  artworkUrl?: (item: Playable) => string | undefined;
}

export function createPlayerStore({ storage, artworkUrl }: PlayerStoreOptions) {
  let driver: AudioDriver | null = null;
  let resume: Record<string, number> = {};

  return createStore<PlayerState>()((set, get) => {
    function queueState(): QueueState {
      const s = get();
      return { items: s.items, index: s.index, repeat: s.repeat };
    }

    function persistQueue() {
      const s = get();
      // Timings are dropped rather than carried: a persisted copy never
      // refreshes, so it would pin whatever the aligner had produced at queue
      // time — forever, across re-alignments.
      const items = s.items.map(({ lineTimings, ...rest }) => rest);
      void storage.setItem(QUEUE_KEY, JSON.stringify({ items, index: s.index }));
    }

    /** What the operating system should show while this item plays. */
    function nowPlaying(item: Playable): NowPlaying {
      return {
        title: item.title,
        artist: item.subtitle ?? item.artist,
        artworkUrl: artworkUrl?.(item),
        isLive: item.isLive,
      };
    }

    /** Load an item and start it. The one place `driver.load` is called. */
    function start(item: Playable, index: number) {
      set({
        current: item,
        index,
        starting: item.id,
        position: startPositionFor(item, resume[item.id]),
      });
      driver?.load(item.url, startPositionFor(item, resume[item.id]), nowPlaying(item));
      driver?.play();
      persistQueue();
    }

    function perform(advance: ReturnType<typeof onNext>) {
      const s = get();
      switch (advance.kind) {
        case 'play': {
          const item = s.items[advance.index];
          if (item) start(item, advance.index);
          return;
        }
        case 'restart': {
          const to = segmentStart(s.current);
          driver?.seek(to);
          set({ position: to });
          // Only a genuine finish resumes playback. A paused player dragged to
          // the end must stay paused rather than snapping back and starting.
          if (s.playing) driver?.play();
          return;
        }
        case 'stop':
          driver?.pause();
          set({ playing: false });
          return;
        case 'none':
          return;
      }
    }

    return {
      current: null,
      items: [],
      index: -1,
      repeat: 'off',
      playing: false,
      position: 0,
      duration: 0,
      starting: null,

      attach(next) {
        driver = next;
      },

      async hydrate() {
        const [rawQueue, rawRepeat, rawResume] = await Promise.all([
          storage.getItem(QUEUE_KEY),
          storage.getItem(REPEAT_KEY),
          storage.getItem(RESUME_KEY),
        ]);

        try {
          resume = rawResume ? JSON.parse(rawResume) : {};
        } catch {
          resume = {};
        }

        let items: Playable[] = [];
        let index = -1;
        try {
          const parsed = rawQueue ? JSON.parse(rawQueue) : null;
          if (Array.isArray(parsed?.items)) {
            items = parsed.items;
            index = typeof parsed.index === 'number' ? parsed.index : -1;
          }
        } catch {
          /* a corrupt queue is an empty queue */
        }

        // Restore, but never auto-play: resuming sound on launch is hostile,
        // and browsers block it outright.
        const current = items[index] ?? null;
        set({
          items,
          index,
          current,
          repeat: parseRepeatMode(rawRepeat),
          position: current ? startPositionFor(current, resume[current.id]) : 0,
        });
        if (current) {
          driver?.load(
            current.url,
            startPositionFor(current, resume[current.id]),
            nowPlaying(current)
          );
        }
      },

      onStatus({ position, duration, playing }) {
        const s = get();
        set({ position, duration, playing, starting: playing ? null : s.starting });

        if (!s.current) return;

        // A segment's end is not the file's end, so no driver will ever report
        // `ended` here. The store watches the clock and advances itself.
        if (playing && hasReachedEnd(s.current, position)) {
          perform(onEnded(queueState(), s.current.isLive === true));
          return;
        }

        if (shouldRememberResume(s.current, position, duration)) {
          resume[s.current.id] = Math.floor(position);
          void storage.setItem(RESUME_KEY, JSON.stringify(resume));
        }
      },

      play(item, replaceQueue = true) {
        if (replaceQueue) {
          set({ items: [item], index: 0 });
          start(item, 0);
          return;
        }
        const items = [...get().items, item];
        set({ items });
        start(item, items.length - 1);
      },

      playList(items, index) {
        const item = items[index];
        if (!item) return;
        // The queue becomes the shelf, which is what makes one tap on a list
        // play a shabad and line up what follows — without this the queue holds
        // a single row and playback stops dead at its end.
        set({ items });
        start(item, index);
      },

      playAt(index) {
        const item = get().items[index];
        if (item) start(item, index);
      },

      toggle() {
        const s = get();
        if (!s.current) return;
        if (s.playing) {
          driver?.pause();
          set({ playing: false });
          return;
        }
        driver?.play();
      },

      next() {
        perform(onNext(queueState(), get().current?.isLive === true));
      },

      previous() {
        const s = get();
        perform(onPrevious(queueState(), elapsedIn(s.current, s.position)));
      },

      seek(seconds) {
        driver?.seek(seconds);
        set({ position: seconds });
      },

      addToQueue(item) {
        set({ items: [...get().items, item] });
        persistQueue();
      },

      removeAt(index) {
        const s = get();
        const items = s.items.filter((_, i) => i !== index);
        // Keep the cursor pointing at the same item: removing something above
        // it would otherwise silently advance the queue.
        set({ items, index: index < s.index ? s.index - 1 : s.index });
        persistQueue();
      },

      clearQueue() {
        set({ items: [], index: -1 });
        persistQueue();
      },

      cycleRepeat() {
        const repeat = nextRepeatMode(get().repeat);
        set({ repeat });
        void storage.setItem(REPEAT_KEY, repeat);
      },
    };
  });
}

export type PlayerStore = ReturnType<typeof createPlayerStore>;
