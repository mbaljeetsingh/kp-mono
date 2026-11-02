/**
 * The shelves Home and an empty Search share.
 *
 * Search shows fewer rows of the same lists, so `limit` trims what is drawn and
 * not what is asked for: both pages read one cached query.
 */
import { shelfShabads, useArtists, useRecentShabads, type ShabadSort } from '@kp/api';
import { RECENT_SHELF_FETCH, type Playable } from '@kp/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { RagiShelf } from '~/components/RagiCard';
import { ShabadList } from '~/components/ShabadList';
import { usePlayer } from '~/lib/player';
import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';

/**
 * Shelves, not the archive — see `shelfShabads`. Short enough that the one
 * below is still in reach; the whole list is a "See all" away.
 */
const SHELF_LIMIT = 8;
const RAGI_LIMIT = 12;

/** The recent list, from the same query the shelf reads. */
export function useRecentShelf() {
  const { userId } = useSession();
  const ids = usePlayer((s) => s.recentIds);
  return useRecentShabads(supabase, userId, ids.slice(0, RECENT_SHELF_FETCH));
}

/**
 * The way back in. Above the archive's shelves because it is the one list that
 * is about this listener; nothing at all for somebody who has not played yet.
 * What is playing stays on it, lit by the row: left out, replaying a shabad from
 * here looked like playing it removed it.
 */
export function RecentShelf({ limit = SHELF_LIMIT }: { limit?: number }) {
  const query = useRecentShelf();
  const items = (query.data ?? []).slice(0, limit);
  if (!items.length) return null;

  return (
    <section className="flex flex-col gap-2">
      <ShelfHeader title="Recently played" link={<Link to="/recent">See all</Link>} />
      <ShabadList items={items} empty="" />
    </section>
  );
}

export function Shelf({
  title,
  sort,
  limit = SHELF_LIMIT,
  onPlay,
}: {
  title: string;
  sort: ShabadSort;
  limit?: number;
  onPlay?: (item: Playable) => void;
}) {
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
        items={(query.data ?? []).slice(0, limit)}
        loading={query.isLoading}
        onPlay={onPlay}
        empty="Nothing published yet."
        emptyHint="The archive grows in the tagging workbench."
      />
    </section>
  );
}

export function RagisShelf() {
  const artists = useArtists(supabase);
  if (!artists.data?.length) return null;

  return (
    <RagiShelf
      artists={artists.data.slice(0, RAGI_LIMIT)}
      action={<Link to="/ragis">See all</Link>}
    />
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
