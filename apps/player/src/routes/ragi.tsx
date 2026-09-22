import { useShabadsByArtist } from '@kp/api';
import { Link, useParams } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';

import { ShabadList } from '~/components/ShabadList';
import { supabase } from '~/lib/supabase';

export function RagiRoute() {
  const { name } = useParams({ from: '/ragis/$name' });
  const query = useShabadsByArtist(supabase, name);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section className="flex flex-col gap-4">
      <Link
        to="/ragis"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Ragis
      </Link>

      <h1 className="font-display text-3xl font-semibold">{name}</h1>

      <ShabadList
        items={items}
        loading={query.isLoading || query.isFetchingNextPage}
        hasMore={query.hasNextPage}
        onLoadMore={() => void query.fetchNextPage()}
        empty="Nothing tagged for this ragi yet."
      />
    </section>
  );
}
