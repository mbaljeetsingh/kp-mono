/**
 * Thirty random shabads, straight into the queue.
 *
 * Every other way in needs the listener to name something first. This is the
 * one for arriving with nothing in mind — which for kirtan is not the unusual
 * case — so the player offers it for as long as nothing is loaded. Once something
 * is, the player's own shuffle reorders that list instead.
 */
import { randomShabads } from '@kp/api';
import { Button } from '@kp/ui/button';
import { useMutation } from '@tanstack/react-query';
import { Shuffle } from 'lucide-react';
import { toast } from 'sonner';

import { playerActions, playerStore } from '~/lib/player';
import { supabase } from '~/lib/supabase';

/**
 * Enough to listen through without thinking about it again, few enough that the
 * queue panel stays readable and a reshuffle is cheap.
 */
const SHUFFLE_SIZE = 30;

export function ShuffleButton() {
  const shuffle = useMutation({
    // The variable is what was playing at the tap, so a slow answer never
    // replaces something the listener has chosen since.
    mutationFn: (_playing: string | undefined) => randomShabads(supabase, SHUFFLE_SIZE),
    onSuccess: (items, playing) => {
      // An empty archive is a race rather than a state to explain.
      if (items.length && playerStore.getState().current?.id === playing) {
        playerActions.playList(items, 0);
      }
    },
    onError: () => toast.error('Could not shuffle. Try again.'),
  });

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Shuffle"
      title="Shuffle"
      disabled={shuffle.isPending}
      onClick={() => shuffle.mutate(playerStore.getState().current?.id)}
    >
      <Shuffle />
    </Button>
  );
}
