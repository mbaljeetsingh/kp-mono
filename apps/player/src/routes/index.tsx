/**
 * Home.
 *
 * Everything here comes from published shabads, never raw files — a 70-minute
 * set is not listenable until somebody has marked where each shabad begins and
 * ends.
 */
import { randomShabads, recentShabads, useSearch } from '@kp/api';
import { DEFAULT_STATION, stationPlayable } from '@kp/core';
import { Button } from '@kp/ui/button';
import { Input } from '@kp/ui/input';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Radio, Search, Shuffle } from 'lucide-react';
import { useState } from 'react';
import { useDebounceValue } from 'usehooks-ts';

import { ShabadList } from '~/components/ShabadList';
import { playerActions } from '~/lib/player';
import { supabase } from '~/lib/supabase';

/**
 * Enough to listen through without thinking about it again, few enough that the
 * queue panel stays readable and a reshuffle is cheap. The queue is the
 * listener's from the moment it lands.
 */
const SHUFFLE_SIZE = 30;

/** A shelf, not the archive — see `recentShabads`. */
const RECENT_LIMIT = 20;

export function HomeRoute() {
  const [term, setTerm] = useState('');
  const [debounced] = useDebounceValue(term, 250);

  const results = useSearch(supabase, debounced);
  const searching = debounced.trim().length >= 2;

  const recent = useQuery({
    queryKey: ['shabads', 'recent', RECENT_LIMIT],
    queryFn: () => recentShabads(supabase, RECENT_LIMIT),
  });

  const shuffle = useMutation({
    mutationFn: () => randomShabads(supabase, SHUFFLE_SIZE),
    onSuccess: (items) => {
      // Nothing published yet is a race rather than a state to explain — the
      // button is hidden when the archive is empty.
      if (items.length) playerActions.playList(items, 0);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Kirtan Player</h1>
          <p className="text-sm text-muted-foreground">
            Twenty years of kirtan from Sri Harmandir Sahib.
          </p>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Shabad, ragi or raag…"
              aria-label="Search the archive"
              className="pl-9"
            />
          </div>

          {/* The other ways in all need the listener to name something first.
              This is the one for arriving with nothing in mind — which for
              kirtan is not the unusual case — and it sits beside the search box
              because that is exactly where somebody stalls with nothing to type. */}
          <Button variant="outline" disabled={shuffle.isPending} onClick={() => shuffle.mutate()}>
            <Shuffle />
            <span className="hidden sm:inline">Shuffle</span>
          </Button>
        </div>
      </header>

      {searching ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Results</h2>
          <ShabadList
            items={results.data?.pages.flatMap((p) => p.items) ?? []}
            loading={results.isLoading || results.isFetchingNextPage}
            hasMore={results.hasNextPage}
            onLoadMore={() => void results.fetchNextPage()}
            empty={`Nothing matches “${debounced.trim()}”.`}
            emptyHint="Most of the archive is still untagged — it may simply not be findable yet."
          />
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-2">
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
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">Recently tagged</h2>
              <Link to="/shabads" className="text-xs text-muted-foreground hover:text-foreground">
                All shabads
              </Link>
            </div>
            <ShabadList
              items={recent.data ?? []}
              loading={recent.isLoading}
              empty="Nothing tagged yet."
              emptyHint="The archive grows in the tagging workbench."
            />
          </section>
        </>
      )}
    </div>
  );
}
