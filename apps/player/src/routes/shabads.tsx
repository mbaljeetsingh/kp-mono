/**
 * The whole archive, paged.
 *
 * Home carries a twenty-row shelf; this is where the endless list belongs.
 */
import { useShabads } from '@kp/api';

import { ShabadList } from '~/components/ShabadList';
import { supabase } from '~/lib/supabase';

export function ShabadsRoute() {
  const query = useShabads(supabase);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">All shabads</h1>
        <p className="text-sm text-muted-foreground">Every published rendition, newest first.</p>
      </header>

      <ShabadList
        items={items}
        loading={query.isLoading || query.isFetchingNextPage}
        hasMore={query.hasNextPage}
        onLoadMore={() => void query.fetchNextPage()}
        empty="Nothing tagged yet."
      />
    </section>
  );
}
