/**
 * The whole archive, paged, in the order the listener picks.
 *
 * Home carries short shelves; this is where the endless lists belong. Each
 * shelf's "See all" lands here already sorted its way.
 */
import { useShabads } from '@kp/api';
import { Link, useSearch } from '@tanstack/react-router';

import { ShabadList } from '~/components/ShabadList';
import { supabase } from '~/lib/supabase';
import { cn } from '~/lib/utils';

const SORTS = [
  { sort: undefined, label: 'Newest' },
  { sort: 'popular', label: 'Popular' },
] as const;

export function ShabadsRoute() {
  const { sort } = useSearch({ from: '/shabads' });
  const query = useShabads(supabase, sort ?? 'newest');
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-semibold">All shabads</h1>
        <nav aria-label="Sort" className="flex gap-1">
          {SORTS.map((s) => (
            <Link
              key={s.label}
              to="/shabads"
              search={s.sort ? { sort: s.sort } : {}}
              replace
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground',
                s.sort === sort && 'bg-primary-soft text-primary hover:text-primary'
              )}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      </header>

      <ShabadList
        items={items}
        loading={query.isLoading || query.isFetchingNextPage}
        hasMore={query.hasNextPage}
        onLoadMore={() => void query.fetchNextPage()}
        empty="Nothing published yet."
      />
    </section>
  );
}
