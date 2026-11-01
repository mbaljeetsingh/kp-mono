/**
 * Whether the phone can reach anything.
 *
 * Module state rather than a hook alone, because the player store asks too, from
 * outside React. Also tells TanStack Query, which otherwise knows nothing about
 * connectivity on a phone: a request made offline ran, failed and left a screen
 * saying "Nothing published yet" about an archive of thousands. Told, it holds
 * the request and sends it when the connection returns.
 */
import { onlineManager } from '@tanstack/react-query';
import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from 'expo-network';
import type { Playable } from '@kp/core';
import { useSyncExternalStore } from 'react';

import { isDownloaded } from './downloads';

// Online until told otherwise: a false "you're offline" on launch is worse than
// the one failed request a false "online" costs.
let online = true;
const listeners = new Set<() => void>();

function apply(state: NetworkState) {
  // Either can be unknown for a moment after launch, which is not offline.
  const next = state.isConnected !== false && state.isInternetReachable !== false;
  if (next === online) return;
  online = next;
  onlineManager.setOnline(next);
  listeners.forEach((listener) => listener());
}

addNetworkStateListener(apply);
void getNetworkStateAsync().then(apply);

/** Ask again now, for a listener tapping Try again. */
export async function recheckNetwork(): Promise<void> {
  apply(await getNetworkStateAsync());
}

export function isOnline(): boolean {
  return online;
}

export function useIsOnline(): boolean {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, isOnline);
}

/**
 * Whether a row's tap can do anything. Online this costs nothing; only offline,
 * when the list is short anyway, does each row read the downloads.
 */
export function useCanPlay(item: Playable): boolean {
  return useIsOnline() || isDownloaded(item);
}
