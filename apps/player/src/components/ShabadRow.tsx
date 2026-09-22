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
import { Link } from '@tanstack/react-router';
import { Pause, Play } from 'lucide-react';
import type { MouseEvent } from 'react';

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

  function toggle() {
    if (isCurrent) playerActions.toggle();
    else (onPlay ?? playerActions.play)(item);
  }

  /**
   * The whole row plays, as it does in every music app and in the mobile one:
   * the play overlay on the thumbnail was the only way in, and nobody aims for
   * a 40px square when the thing they mean to press is the title beside it.
   *
   * Controls that mean something else — the artist link, the heart, the menu,
   * the overlay button itself — are skipped by finding them in the click's
   * ancestry rather than by each one stopping propagation, so a control added
   * to this row later cannot forget to opt out and silently start playback.
   */
  function onRowClick(event: MouseEvent<HTMLDivElement>) {
    // The row's menu renders in a portal, and React routes a portal's events up
    // the component tree rather than the DOM tree — so choosing "Add to queue"
    // or a playlist arrived here as a click on the row and started playing the
    // thing you were quietly filing. Anything that did not physically land
    // inside the row is not a click on the row.
    if (!event.currentTarget.contains(event.target as Node)) return;
    if ((event.target as Element).closest('a,button')) return;
    toggle();
  }

  return (
    <div
      onClick={onRowClick}
      className={cn(
        'group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/50',
        isCurrent && 'bg-accent/60'
      )}
    >
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
        {/* Redundant for a mouse now that the row plays, and the reason this
            still works from a keyboard: it is the row's focusable control, and
            it is what a screen reader reads out as the play/pause state. */}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={isCurrent && playing ? `Pause ${item.title}` : `Play ${item.title}`}
          onClick={toggle}
          className={cn(
            'absolute inset-0 size-10 rounded-md bg-black/45 text-white opacity-0 hover:bg-black/60 focus-visible:opacity-100 group-hover:opacity-100',
            isCurrent && 'opacity-100'
          )}
        >
          {isCurrent && playing ? <Pause /> : <Play />}
        </Button>
      </div>

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm', isCurrent && 'text-primary')}>{item.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {/* The one part of the row that does not play: a listener who taps a
              ragi's name means their shabads, not this one. `artist` and not
              `subtitle`, because the route keys on the stored name while the
              display name is the one worth reading. */}
          {item.artist ? (
            <Link
              to="/ragis/$name"
              params={{ name: item.artist }}
              className="hover:text-foreground hover:underline"
            >
              {item.subtitle ?? item.artist}
            </Link>
          ) : (
            item.subtitle
          )}
          {item.raag ? ` · ${item.raag}` : ''}
        </p>
      </div>

      {/* Zero means untagged — a whole file whose length nobody knows until it
          loads, so showing 0:00 would be a lie. */}
      {length > 0 ? (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{clock(length)}</span>
      ) : null}

      <FavoriteButton
        id={item.id}
        name={item.title}
        className="shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 aria-pressed:opacity-100 touch:opacity-100"
      />
      <ShabadMenu item={item} />
    </div>
  );
}
