/**
 * The one player instance, and the hooks that read it.
 *
 * Selectors are not optional: the driver reports position ten times a second,
 * so any component reading the whole store re-renders at 10Hz forever.
 */
import { playableTile, titleIn } from '@kp/core';
import { createPlayerStore, type PlayerState } from '@kp/playback';
import { useStore } from 'zustand';

import { createNativeAudioDriver } from './audio-driver';
import { storage } from './storage';
import { tileArtworkUrl } from './lock-screen-art';
import { readTitleScript } from './title-script';

export const playerStore = createPlayerStore({
  storage,
  // The shabad's own tile, as on every row — not the ragi's photo. A URL only
  // once LockScreenArtwork has drawn it; it re-announces when it has.
  artworkUrl: (item) => tileArtworkUrl(playableTile(item, readTitleScript())),
  // And the title in the listener's script, read when the item loads.
  titleOf: (item) => titleIn(item, readTitleScript()),
});

playerStore.getState().attach(
  createNativeAudioDriver(
    (status) => playerStore.getState().onStatus(status),
    // The lock screen's buttons do what the player's own do.
    (command) =>
      command === 'next' ? playerStore.getState().next() : playerStore.getState().previous()
  )
);

// Restore the queue on launch. Never auto-plays — see the store. The storage
// module carries anything AsyncStorage held across before answering a read, so
// there is no ordering to arrange here.
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
  cue: (...args: Parameters<PlayerState['cue']>) => playerStore.getState().cue(...args),
  addToQueue: (...args: Parameters<PlayerState['addToQueue']>) =>
    playerStore.getState().addToQueue(...args),
  cycleRepeat: () => playerStore.getState().cycleRepeat(),
  playAt: (index: number) => playerStore.getState().playAt(index),
  removeAt: (index: number) => playerStore.getState().removeAt(index),
  clearQueue: () => playerStore.getState().clearQueue(),
  retitle: () => playerStore.getState().retitle(),
};
