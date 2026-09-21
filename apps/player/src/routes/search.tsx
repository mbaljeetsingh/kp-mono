import { useSearch as useSearchQuery } from '@kp/api';
import { Input } from '@kp/ui/input';
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

      <Input
        type="search"
        value={term}
        autoFocus
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Shabad or ragi…"
        aria-label="Search shabads and ragis"
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
