/**
 * Thirty random shabads, straight into the queue.
 *
 * Every other way in needs the listener to name something first. This is the
 * one for arriving with nothing in mind — which for kirtan is not the unusual
 * case — so the player offers it for as long as nothing is loaded. Once something
 * is, the player's own shuffle takes over (~/lib/shuffle).
 */
import { Button } from '@kp/ui/button';
import { Shuffle } from 'lucide-react';

import { usePlayerShuffle } from '~/lib/shuffle';

export function ShuffleButton() {
  const { shuffle, pending } = usePlayerShuffle();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Shuffle"
      title="Shuffle"
      disabled={pending}
      onClick={shuffle}
    >
      <Shuffle />
    </Button>
  );
}
