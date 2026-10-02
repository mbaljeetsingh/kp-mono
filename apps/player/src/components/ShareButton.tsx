/**
 * Share what is playing.
 *
 * The position is read at the moment of the tap, not subscribed to: it
 * changes ten times a second, and a button re-rendering at 10Hz to show
 * nothing different is exactly what the store's selectors exist to prevent.
 */
import { Button } from '@kp/ui/button';
import type { Playable } from '@kp/core';
import { Share2 } from 'lucide-react';

import { playerStore } from '~/lib/player';
import { shareRendition } from '~/lib/share';
import { useShownTitle } from '~/lib/title-script';
import { cn } from '~/lib/utils';

export function ShareButton({ item, className }: { item: Playable; className?: string }) {
  const title = useShownTitle(item);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Share ${title}`}
      onClick={() => void shareRendition(item, playerStore.getState().position, title)}
      className={cn('rounded-full', className)}
    >
      <Share2 />
    </Button>
  );
}
