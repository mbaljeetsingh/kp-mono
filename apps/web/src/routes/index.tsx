import { useShabads } from '@kp/api';

import { ShabadList } from '~/components/ShabadList';
import { supabase } from '~/lib/supabase';

export function HomeRoute() {
  const query = useShabads(supabase);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Recently tagged</h1>
        <p className="text-sm text-muted-foreground">
          Twenty years of kirtan from Sri Harmandir Sahib.
        </p>
      </header>

      {query.isError ? (
        <p className="text-sm text-destructive">Could not load shabads. Try again shortly.</p>
      ) : null}

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
