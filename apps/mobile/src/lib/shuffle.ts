/**
 * The full player's shuffle button: reorder what is to come, or fetch random
 * shabads when too little is left to reorder (@kp/core's shuffleAction).
 * As the web's (apps/player/src/lib/shuffle.ts).
 */
import { randomShabads } from '@kp/api';
import { shuffleAction, SHUFFLE_SIZE } from '@kp/core';
import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { playerActions, playerStore } from '~/lib/player';
import { supabase } from '~/lib/supabase';

export function useShuffle() {
  const { mutate, isPending } = useMutation({
    // The variable is what was playing at the press. A slow answer adds nothing
    // to a list the listener has changed since.
    mutationFn: (_playing: string | undefined) => randomShabads(supabase, SHUFFLE_SIZE),
    onSuccess: (rows, playing) => {
      const state = playerStore.getState();
      if (state.current?.id === playing && shuffleAction(state) === 'fetch') {
        playerActions.addRandomToQueue(rows);
      }
    },
    onError: () => Alert.alert('Could not shuffle. Try again.'),
  });

  const shuffle = useCallback(() => {
    const state = playerStore.getState();
    const action = shuffleAction(state);
    if (action === 'toggle') playerActions.toggleShuffle();
    else if (action === 'fetch') mutate(state.current?.id);
  }, [mutate]);

  return { shuffle, pending: isPending };
}
