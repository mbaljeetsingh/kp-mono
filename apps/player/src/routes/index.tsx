/**
 * Home.
 *
 * Everything here comes from published shabads, never raw files — a 70-minute
 * set is not listenable until somebody has marked where each shabad begins and
 * ends. Search lives in the header, so Home is only shelves.
 */
import { DEFAULT_STATION, stationPlayable } from '@kp/core';
import { Play, Radio } from 'lucide-react';

import { LiveBadge } from '~/components/LiveBadge';
import { RagisShelf, RecentShelf, Shelf } from '~/components/Shelves';
import { playerActions } from '~/lib/player';

export function HomeRoute() {
  return (
    <div className="flex flex-col gap-8">
      {/* Unseen, but a screen reader still needs the page to have a heading. */}
      <h1 className="sr-only">Kirtan Player</h1>

      {/* The same card as the phone's. */}
      <div className="overflow-hidden rounded-2xl bg-card">
        <button
          type="button"
          onClick={() => playerActions.play(stationPlayable(DEFAULT_STATION))}
          className="flex w-full items-center gap-3 p-3 text-left hover:bg-accent/50"
        >
          <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary-soft">
            <Radio className="size-6 text-primary" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <LiveBadge />
            <span className="block truncate text-[17px] font-semibold">{DEFAULT_STATION.name}</span>
            <span className="block truncate text-[13px] text-muted-foreground">
              {DEFAULT_STATION.place}
            </span>
          </span>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary">
            <Play className="size-5 fill-primary-foreground text-primary-foreground" />
          </span>
        </button>
      </div>

      <RecentShelf />
      <Shelf title="Recently added" sort="newest" />
      <Shelf title="Popular" sort="popular" />
      <RagisShelf />
    </div>
  );
}
