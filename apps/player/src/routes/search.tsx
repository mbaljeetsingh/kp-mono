/**
 * One search for everything: ragis first, then shabads.
 *
 * Ragis come first because a name that matches a ragi is almost always a
 * search for that ragi, and their shabads are one tap further on. They are
 * filtered on the device — the directory is one small cached list, and a
 * round trip per keystroke for it would be the slower way to get the same rows.
 */
import { useArtists, useSearch as useSearchQuery } from '@kp/api';
import { useSearch } from '@tanstack/react-router';
import { useDebounceValue } from 'usehooks-ts';

import { RagiShelf } from '~/components/RagiCard';
import { SearchField } from '~/components/SearchField';
import { ShabadList } from '~/components/ShabadList';
import { supabase } from '~/lib/supabase';

const RAGI_LIMIT = 8;

export function SearchRoute() {
  const { q = '' } = useSearch({ from: '/search' });
  const [term] = useDebounceValue(q.trim(), 250);
  const ready = term.length >= 2;

  const results = useSearchQuery(supabase, term);
  const artists = useArtists(supabase);

  const needle = term.toLowerCase();
  const ragis = ready
    ? (artists.data ?? [])
        .filter((a) => (a.display_name ?? a.name).toLowerCase().includes(needle))
        .slice(0, RAGI_LIMIT)
    : [];

  return (
    <section className="flex flex-col gap-6">
      {/* A desktop searches from the header; a phone has no room there. */}
      <SearchField autoFocus className="sm:hidden" />

      {/* Said rather than left blank: a search box that does nothing for one
          character reads as broken. */}
      {!ready ? (
        <p className="px-1 text-sm text-muted-foreground">Type at least two characters.</p>
      ) : (
        <>
          {ragis.length ? <RagiShelf artists={ragis} /> : null}

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Shabads</h2>
            <ShabadList
              items={results.data?.pages.flatMap((p) => p.items) ?? []}
              loading={results.isLoading || results.isFetchingNextPage}
              hasMore={results.hasNextPage}
              onLoadMore={() => void results.fetchNextPage()}
              empty={`Nothing matches “${term}”.`}
              emptyHint="Most of the archive is still untagged — it may simply not be findable yet."
            />
          </section>
        </>
      )}
    </section>
  );
}
