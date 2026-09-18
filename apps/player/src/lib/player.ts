/**
 * The one player instance, and the hooks that read it.
 *
 * Selectors are not optional here. The driver reports position ten times a
 * second, so any component reading the whole store re-renders at 10Hz forever.
 * `usePlayer(s => s.playing)` re-renders on that field alone — which is the
 * entire reason this is Zustand and not Context.
 */
import { createPlayerStore, type PlayerState } from '@kp/playback';
import { useStore } from 'zustand';

import { createWebAudioDriver } from './audio-driver';

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

export const playerStore = createPlayerStore({ storage });

playerStore
  .getState()
  .attach(createWebAudioDriver((status) => playerStore.getState().onStatus(status)));

// Restore the queue on load. Never auto-plays — see the store.
void playerStore.getState().hydrate();

export function usePlayer<T>(selector: (state: PlayerState) => T): T {
  return useStore(playerStore, selector);
}

/** Actions never change identity, so reading them causes no re-renders. */
export const playerActions = {
  play: (...args: Parameters<PlayerState['play']>) => playerStore.getState().play(...args),
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
};
