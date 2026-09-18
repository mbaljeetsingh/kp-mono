/**
 * The one player instance, and the hooks that read it.
 *
 * Selectors are not optional: the driver reports position ten times a second,
 * so any component reading the whole store re-renders at 10Hz forever.
 */
import { createPlayerStore, type PlayerState } from '@kp/playback';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from 'zustand';

import { createNativeAudioDriver } from './audio-driver';

export const playerStore = createPlayerStore({
  storage: {
    async getItem(key) {
      try {
        return await AsyncStorage.getItem(key);
      } catch {
        return null;
      }
    },
    async setItem(key, value) {
      try {
        await AsyncStorage.setItem(key, value);
      } catch {
        /* a device with storage trouble still gets a working player */
      }
    },
  },
});

playerStore
  .getState()
  .attach(createNativeAudioDriver((status) => playerStore.getState().onStatus(status)));

// Restore the queue on launch. Never auto-plays — see the store.
void playerStore.getState().hydrate();

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
