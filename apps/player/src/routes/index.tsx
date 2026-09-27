/**
 * Home.
 *
 * Everything here comes from published shabads, never raw files — a 70-minute
 * set is not listenable until somebody has marked where each shabad begins and
 * ends. Search and shuffle live in the header, so Home is only shelves.
 */
import { shelfShabads, useArtists, type ShabadSort } from '@kp/api';
import { DEFAULT_STATION, stationPlayable } from '@kp/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Radio } from 'lucide-react';
import type { ReactNode } from 'react';

import { RagiShelf } from '~/components/RagiCard';
import { ShabadList } from '~/components/ShabadList';
import { playerActions } from '~/lib/player';
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
      <header>
        <h1 className="font-display text-3xl font-semibold">Kirtan Player</h1>
        <p className="text-sm text-muted-foreground">
          Twenty years of kirtan from Sri Harmandir Sahib.
        </p>
      </header>

      <button
        type="button"
        onClick={() => playerActions.play(stationPlayable(DEFAULT_STATION))}
        className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-left hover:bg-accent/50"
      >
        <Radio className="size-5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{DEFAULT_STATION.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            Live now · {DEFAULT_STATION.place}
          </span>
        </span>
        <Link
          to="/radio"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
        >
          All stations
        </Link>
      </button>

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
