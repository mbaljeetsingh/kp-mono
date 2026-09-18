/**
 * One rendition in a list.
 *
 * `isCurrent` is passed in rather than read from the store: a shelf of fifty
 * rows each subscribing to `current` is fifty subscriptions re-evaluated on
 * every track change, when the parent already knows which one matches.
 */
import { segmentTotal, type Playable } from '@kp/core';
import { Button } from '@kp/ui/button';
import { Play, Pause, Plus } from 'lucide-react';

import { playerActions } from '~/lib/player';
import { clock, cn } from '~/lib/utils';

interface Props {
  item: Playable;
  isCurrent: boolean;
  playing: boolean;
}

export function ShabadRow({ item, isCurrent, playing }: Props) {
  const length = segmentTotal(item, 0);

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent/50',
        isCurrent && 'bg-accent/60'
      )}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={isCurrent && playing ? `Pause ${item.title}` : `Play ${item.title}`}
        onClick={() => (isCurrent ? playerActions.toggle() : playerActions.play(item))}
        className="shrink-0 rounded-full">
        {isCurrent && playing ? <Pause /> : <Play />}
      </Button>

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm', isCurrent && 'text-primary')}>{item.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {item.subtitle ?? item.artist}
          {item.raag ? ` · ${item.raag}` : ''}
        </p>
      </div>

      {/* Zero means untagged — a whole file whose length we do not know until
          it loads, so showing 0:00 would be a lie. */}
      {length > 0 ? (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{clock(length)}</span>
      ) : null}

      <Button
        variant="ghost"
        size="icon"
        aria-label={`Add ${item.title} to queue`}
        onClick={() => playerActions.addToQueue(item)}
        className="shrink-0 rounded-full opacity-0 focus-visible:opacity-100 group-hover:opacity-100">
        <Plus />
      </Button>
    </div>
  );
}
