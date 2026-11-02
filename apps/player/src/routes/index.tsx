/**
 * Home.
 *
 * Everything here comes from published shabads, never raw files — a 70-minute
 * set is not listenable until somebody has marked where each shabad begins and
 * ends. Search lives in the header, so Home is only shelves.
 */
import { shelfShabads, useArtists, useRecentShabads, type ShabadSort } from '@kp/api';
import { DEFAULT_STATION, RECENT_SHELF_FETCH, stationPlayable } from '@kp/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Play, Radio } from 'lucide-react';
import type { ReactNode } from 'react';

import { LiveBadge } from '~/components/LiveBadge';
import { RagiShelf } from '~/components/RagiCard';
import { ShabadList } from '~/components/ShabadList';
import { playerActions, usePlayer } from '~/lib/player';
import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';

/**
 * Shelves, not the archive — see `shelfShabads`. Short enough that the one
 * below is still in reach; the whole list is a "See all" away.
 */
const SHELF_LIMIT = 8;
const RAGI_LIMIT = 12;

export function HomeRoute() {
  const artists = useArtists(supabase);

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

      {artists.data?.length ? (
        <RagiShelf
          artists={artists.data.slice(0, RAGI_LIMIT)}
          action={<Link to="/ragis">See all</Link>}
        />
      ) : null}
    </div>
  );
}

/**
 * The way back in. Above the archive's shelves because it is the one list that
 * is about this listener; nothing at all for somebody who has not played yet.
 * What is playing stays on it, lit by the row: left out, replaying a shabad from
 * here looked like playing it removed it.
 */
function RecentShelf() {
  const { userId } = useSession();
  const ids = usePlayer((s) => s.recentIds);
  const query = useRecentShabads(supabase, userId, ids.slice(0, RECENT_SHELF_FETCH));
  const items = (query.data ?? []).slice(0, SHELF_LIMIT);
  if (!items.length) return null;

  return (
    <section className="flex flex-col gap-2">
      <ShelfHeader title="Recently played" link={<Link to="/recent">See all</Link>} />
      <ShabadList items={items} empty="" />
    </section>
  );
}

function Shelf({ title, sort }: { title: string; sort: ShabadSort }) {
  const query = useQuery({
    queryKey: ['shabads', sort, SHELF_LIMIT],
    queryFn: () => shelfShabads(supabase, SHELF_LIMIT, sort),
  });

  return (
    <section className="flex flex-col gap-2">
      <ShelfHeader
        title={title}
        link={
          <Link to="/shabads" search={sort === 'popular' ? { sort } : {}}>
            See all
          </Link>
        }
      />
      <ShabadList
        items={query.data ?? []}
        loading={query.isLoading}
        empty="Nothing published yet."
        emptyHint="The archive grows in the tagging workbench."
      />
    </section>
  );
}

function ShelfHeader({ title, link }: { title: string; link: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-sm font-medium">{title}</h2>
      <span className="text-xs text-muted-foreground hover:text-foreground">{link}</span>
    </div>
  );
}
