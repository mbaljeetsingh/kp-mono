/**
 * The one player instance, and the hooks that read it.
 *
 * Selectors are not optional: the driver reports position ten times a second,
 * so any component reading the whole store re-renders at 10Hz forever.
 */
import { createPlayerStore, type PlayerState } from '@kp/playback';
import { useStore } from 'zustand';

import { createNativeAudioDriver } from './audio-driver';
import { migrateFromAsyncStorage, storage } from './storage';
import { artistPhotoUrl } from './supabase';

/** Everything the store keeps. Listed so the one-time migration can carry it. */
const KEYS = ['kp:queue', 'kp:repeat', 'kp:resume'];

export const playerStore = createPlayerStore({
  storage,
  // The lock screen wants a URL, and only the app knows where artwork lives.
  artworkUrl: (item) => artistPhotoUrl(item.artistPhoto) ?? undefined,
});

playerStore
  .getState()
  .attach(createNativeAudioDriver((status) => playerStore.getState().onStatus(status)));

/*
 * Carry any AsyncStorage data over before reading, then restore the queue.
 * Never auto-plays — see the store.
 */
void migrateFromAsyncStorage([...KEYS, 'kp:favorites']).then(() =>
  playerStore.getState().hydrate()
);

export function usePlayer<T>(selector: (state: PlayerState) => T): T {
  return useStore(playerStore, selector);
}

/** Actions never change identity, so reading them causes no re-renders. */
export const playerActions = {
  play: (...args: Parameters<PlayerState['play']>) => playerStore.getState().play(...args),
  playList: (...args: Parameters<PlayerState['playList']>) =>
    playerStore.getState().playList(...args),
  toggle: () => playerStore.getState().toggle(),
  next: () => playerStore.getState().next(),
  previous: () => playerStore.getState().previous(),
  seek: (seconds: number) => playerStore.getState().seek(seconds),
  addToQueue: (...args: Parameters<PlayerState['addToQueue']>) =>
    playerStore.getState().addToQueue(...args),
  cycleRepeat: () => playerStore.getState().cycleRepeat(),
  playAt: (index: number) => playerStore.getState().playAt(index),
  removeAt: (index: number) => playerStore.getState().removeAt(index),
  clearQueue: () => playerStore.getState().clearQueue(),
};
