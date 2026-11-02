/**
 * One search for everything: ragis first, then shabads.
 *
 * Ragis come first because a name that matches a ragi is almost always a
 * search for that ragi, and their shabads are one tap further on. They are
 * filtered on the device — the directory is one small cached list, and a
 * round trip per keystroke for it would be the slower way to get the same rows.
 * Their names are roman, so Punjabi keystrokes are never held against them.
 */
import { groupByLine, minSearchLength, useArtists, useSearch as useSearchQuery } from '@kp/api';
import { useSearch } from '@tanstack/react-router';
import { useDebounceValue } from 'usehooks-ts';

import { RagiShelf } from '~/components/RagiCard';
import { SearchField } from '~/components/SearchField';
import { ShabadList } from '~/components/ShabadList';
import { BANIDB_BASE } from '~/lib/links';
import { supabase } from '~/lib/supabase';
import { useTitleScript } from '~/lib/title-script';

const RAGI_LIMIT = 8;

export function SearchRoute() {
  const { q = '' } = useSearch({ from: '/search' });
  const [term] = useDebounceValue(q.trim(), 250);
  const [script] = useTitleScript();
  const min = minSearchLength(script);
  const ready = term.length >= min;

  const results = useSearchQuery(supabase, BANIDB_BASE, term, script);
  const artists = useArtists(supabase);

  const grouped = groupByLine(
    results.data?.pages.flatMap((p) => p.items) ?? [],
    results.data?.pages[0]?.lines,
    term,
    script
  );

  const needle = term.toLowerCase();
  const ragis =
    ready && script === 'en'
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
        <p className="px-1 text-sm text-muted-foreground">Type at least {min} characters.</p>
      ) : (
        <>
          {ragis.length ? <RagiShelf artists={ragis} /> : null}

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Shabads</h2>
            {results.data?.pages[0]?.partial ? (
              <p className="px-1 text-sm text-muted-foreground">
                Many lines match. Type another letter to narrow it.
              </p>
            ) : null}
            {results.isRefetchError ? (
              <p className="px-1 text-sm text-muted-foreground">Could not refresh these results.</p>
            ) : null}
            {results.data?.pages[0]?.degraded ? (
              <p className="px-1 text-sm text-muted-foreground">
                First-letter search is unavailable right now. Showing titles and ragis.
              </p>
            ) : null}
            {results.isError && !results.data ? (
              <p className="px-1 text-sm text-muted-foreground">Could not search just now.</p>
            ) : (
              <ShabadList
                items={grouped.items}
                loading={results.isLoading || results.isFetchingNextPage}
                hasMore={results.hasNextPage}
                onLoadMore={() => void results.fetchNextPage()}
                // Punjabi's term is GurbaniLipi keystrokes, which read as nonsense here.
                empty={script === 'pa' ? 'Nothing matches.' : `Nothing matches “${term}”.`}
                headings={grouped.headings}
                emptyHint="Most of the archive is still untagged — it may simply not be findable yet."
              />
            )}
            {results.isFetchNextPageError ? (
              <p className="px-1 text-sm text-muted-foreground">Could not load more. Try again.</p>
            ) : null}
          </section>
        </>
      )}
    </section>
  );
}
