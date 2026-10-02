/**
 * The one player instance, and the hooks that read it.
 *
 * Selectors are not optional here. The driver reports position ten times a
 * second, so any component reading the whole store re-renders at 10Hz forever.
 * `usePlayer(s => s.playing)` re-renders on that field alone — which is the
 * entire reason this is Zustand and not Context.
 */
import { registerPlay } from '@kp/api';
import { titleIn } from '@kp/core';
import { createPlayerStore, type PlayerState } from '@kp/playback';
import { useStore } from 'zustand';

import { createWebAudioDriver } from './audio-driver';
import { artistPhotoUrl, supabase } from './supabase';
import { readTitleScript } from './title-script';

const storage = {
  async getItem(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      // Private mode and blocked site data both throw rather than return null.
      return null;
    }
  },
  async setItem(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* a listener who blocked storage still gets a working player */
    }
  },
};

export const playerStore = createPlayerStore({
  storage,
  // The lock screen wants a URL, and only the app knows where artwork lives.
  artworkUrl: (item) => artistPhotoUrl(item.artistPhoto) ?? undefined,
  // And the title in the listener's script, read when the item loads.
  titleOf: (item) => titleIn(item, readTitleScript()),
});

playerStore
  .getState()
  .attach(createWebAudioDriver((status) => playerStore.getState().onStatus(status)));

// Restore the queue on load. Never auto-plays — see the store.
void playerStore.getState().hydrate();

/**
 * A listen is thirty seconds actually heard, not a tap: skipping through a
 * queue would otherwise make whatever sits at the top of it "popular".
 *
 * Counted as time heard rather than read off the position, so a seek forward
 * does not count and a seek back does not count twice. Radio is not a
 * rendition, so it is never counted.
 */
const LISTEN_SEC = 30;
let listen = { id: '', heard: 0, last: 0, counted: false };

playerStore.subscribe(({ current, playing, position }) => {
  if (!current || current.isLive) return;
  if (current.id !== listen.id)
    listen = { id: current.id, heard: 0, last: position, counted: false };

  const step = position - listen.last;
  listen.last = position;
  if (!playing || listen.counted || step <= 0 || step > 2) return;

  listen.heard += step;
  if (listen.heard >= LISTEN_SEC) {
    listen.counted = true;
    // Best effort: a lost count is not worth an error in front of a listener.
    registerPlay(supabase, current.id).catch(() => {});
  }
});

export function usePlayer<T>(selector: (state: PlayerState) => T): T {
  return useStore(playerStore, selector);
}

/** Actions never change identity, so reading them causes no re-renders. */
export const playerActions = {
  play: (...args: Parameters<PlayerState['play']>) => playerStore.getState().play(...args),
  cue: (...args: Parameters<PlayerState['cue']>) => playerStore.getState().cue(...args),
  toggle: () => playerStore.getState().toggle(),
  next: () => playerStore.getState().next(),
  previous: () => playerStore.getState().previous(),
  seek: (seconds: number) => playerStore.getState().seek(seconds),
  addToQueue: (...args: Parameters<PlayerState['addToQueue']>) =>
    playerStore.getState().addToQueue(...args),
  cycleRepeat: () => playerStore.getState().cycleRepeat(),
  playAt: (index: number) => playerStore.getState().playAt(index),
  playList: (...args: Parameters<PlayerState['playList']>) =>
    playerStore.getState().playList(...args),
  removeAt: (index: number) => playerStore.getState().removeAt(index),
  clearQueue: () => playerStore.getState().clearQueue(),
  retitle: () => playerStore.getState().retitle(),
};
