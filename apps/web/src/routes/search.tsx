import { useSearch as useSearchQuery } from '@kp/api';
import { useState } from 'react';

import { ShabadList } from '~/components/ShabadList';
import { supabase } from '~/lib/supabase';

export function SearchRoute() {
  const [term, setTerm] = useState('');
  const query = useSearchQuery(supabase, term);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const ready = term.trim().length >= 2;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Search</h1>

      <input
        type="search"
        value={term}
        autoFocus
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Shabad or ragi…"
        aria-label="Search shabads and ragis"
        className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
      />

      {/* Said rather than left blank: a search box that does nothing for one
          character reads as broken. */}
      {!ready ? (
        <p className="px-1 text-sm text-muted-foreground">Type at least two characters.</p>
      ) : (
        <ShabadList
          items={items}
          loading={query.isLoading || query.isFetchingNextPage}
          hasMore={query.hasNextPage}
          onLoadMore={() => void query.fetchNextPage()}
          empty={`Nothing matches “${term.trim()}”.`}
        />
      )}
    </section>
  );
}
