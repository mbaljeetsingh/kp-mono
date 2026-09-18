/**
 * One rendition in a list.
 *
 * `isCurrent` and `playing` are passed in rather than read from the store: a
 * shelf of fifty rows each subscribing to the player is fifty subscriptions
 * re-evaluated ten times a second, when the parent already knows which row
 * matches.
 */
import { segmentTotal, type Playable } from '@kp/core';
import { Button } from '@kp/ui/button';
import { Pause, Play } from 'lucide-react';

import { ArtTile } from '~/components/ArtTile';
import { FavoriteButton } from '~/components/FavoriteButton';
import { ShabadMenu } from '~/components/ShabadMenu';
import { playerActions } from '~/lib/player';
import { artistPhotoUrl } from '~/lib/supabase';
import { clock, cn } from '~/lib/utils';

interface Props {
  item: Playable;
  isCurrent: boolean;
  playing: boolean;
  /** Playing this row queues the rest of the list from here. */
  onPlay?: (item: Playable) => void;
}

export function ShabadRow({ item, isCurrent, playing, onPlay }: Props) {
  const length = segmentTotal(item, 0);

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/50',
        isCurrent && 'bg-accent/60'
      )}>
      <div className="group/art relative shrink-0">
        <ArtTile
          name={item.artist ?? item.title}
          src={artistPhotoUrl(item.artistPhoto)}
          className={cn(
            'size-10 text-lg',
            // The play overlay covers this tile on hover; initials showing
            // through it read as a mistake rather than a hover state.
            '[&>span]:transition-opacity group-hover:[&>span]:opacity-0',
            isCurrent && '[&>span]:opacity-0'
          )}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={isCurrent && playing ? `Pause ${item.title}` : `Play ${item.title}`}
          onClick={() =>
            isCurrent ? playerActions.toggle() : (onPlay ?? playerActions.play)(item)
          }
          className={cn(
            'absolute inset-0 size-10 rounded-md bg-black/45 text-white opacity-0 hover:bg-black/60 focus-visible:opacity-100 group-hover:opacity-100',
            isCurrent && 'opacity-100'
          )}>
          {isCurrent && playing ? <Pause /> : <Play />}
        </Button>
      </div>

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm', isCurrent && 'text-primary')}>{item.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {item.subtitle ?? item.artist}
          {item.raag ? ` · ${item.raag}` : ''}
        </p>
      </div>

      {/* Zero means untagged — a whole file whose length nobody knows until it
          loads, so showing 0:00 would be a lie. */}
      {length > 0 ? (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {clock(length)}
        </span>
      ) : null}

      <FavoriteButton
        id={item.id}
        name={item.title}
        className="shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 aria-pressed:opacity-100"
      />
      <ShabadMenu item={item} />
    </div>
  );
}
