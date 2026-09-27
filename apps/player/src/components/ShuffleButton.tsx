/**
 * Thirty random shabads, straight into the queue.
 *
 * Every other way in needs the listener to name something first. This is the
 * one for arriving with nothing in mind — which for kirtan is not the unusual
 * case — so it sits beside the search box, exactly where somebody stalls with
 * nothing to type.
 */
import { randomShabads } from '@kp/api';
import { Button } from '@kp/ui/button';
import { useMutation } from '@tanstack/react-query';
import { Shuffle } from 'lucide-react';

import { playerActions } from '~/lib/player';
import { supabase } from '~/lib/supabase';

/**
 * Enough to listen through without thinking about it again, few enough that the
 * queue panel stays readable and a reshuffle is cheap.
 */
const SHUFFLE_SIZE = 30;

export function ShuffleButton() {
  const shuffle = useMutation({
    mutationFn: () => randomShabads(supabase, SHUFFLE_SIZE),
    onSuccess: (items) => {
      // An empty archive is a race rather than a state to explain.
      if (items.length) playerActions.playList(items, 0);
    },
  });

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Shuffle"
      title="Shuffle"
      disabled={shuffle.isPending}
      onClick={() => shuffle.mutate()}
    >
      <Shuffle />
    </Button>
  );
}
