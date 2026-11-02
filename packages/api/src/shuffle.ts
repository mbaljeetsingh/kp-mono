/**
 * Pressing shuffle, from wherever it is offered: reorder what is to come, or fetch
 * random shabads (@kp/core's shuffleAction says which).
 */
import { shuffleAction, SHUFFLE_SIZE, type Playable } from '@kp/core';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import type { KpClient } from './client';
import { randomShabads } from './queries';

/** One key, so a button and its keyboard shortcut are one pending fetch. */
const MUTATION_KEY = ['shuffle'];

/** The player store, as far as this needs it. @kp/api does not depend on @kp/playback. */
export interface ShuffleStore {
  getState(): {
    items: Playable[];
    index: number;
    current: Playable | null;
    shuffleOrder: readonly string[] | null;
    toggleShuffle(): void;
    addRandomToQueue(rows: readonly Playable[]): void;
    playList(items: Playable[], index: number): void;
  };
}

export function useShuffle(client: KpClient, store: ShuffleStore, onError?: () => void) {
  const queryClient = useQueryClient();
  const { mutate, isError } = useMutation({
    mutationKey: MUTATION_KEY,
    // The variable is what was playing at the press. A slow answer does nothing
    // to a list the listener has changed since.
    mutationFn: (_playing: string | undefined) => randomShabads(client, SHUFFLE_SIZE),
    onSuccess: (rows, playing) => {
      const state = store.getState();
      if (state.current?.id !== playing) return;
      const action = shuffleAction(state);
      if (action === 'fetch') state.addRandomToQueue(rows);
      // An empty archive is a race rather than a state to explain.
      else if (action === 'start' && rows.length) state.playList(rows, 0);
    },
    onError,
  });
  const pending = useIsMutating({ mutationKey: MUTATION_KEY }) > 0;

  const shuffle = useCallback(() => {
    const state = store.getState();
    const action = shuffleAction(state);
    if (action === 'toggle') state.toggleShuffle();
    else if (action !== 'none' && !queryClient.isMutating({ mutationKey: MUTATION_KEY })) {
      mutate(state.current?.id);
    }
  }, [mutate, queryClient, store]);

  return { shuffle, pending, failed: isError };
}
