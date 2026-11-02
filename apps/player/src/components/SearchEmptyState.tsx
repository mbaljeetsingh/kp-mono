/**
 * Search before anything is typed: the listener's recent searches, then a way
 * back to what they played, or the popular shabads if they have played nothing.
 */
import { History, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@kp/ui/button';

import { ShabadRowSkeletons } from '~/components/ShabadRowSkeletons';
import { RagisShelf, RecentShelf, Shelf, useRecentShelf } from '~/components/Shelves';
import { usePlayer } from '~/lib/player';
import { useRecentSearches } from '~/lib/recent-searches';
import { useTitleScript } from '~/lib/title-script';
import { cn } from '~/lib/utils';

const ROWS = 5;

export function SearchEmptyState({ onSearch }: { onSearch: (term: string) => void }) {
  const recentReady = usePlayer((s) => s.recentReady);
  const recent = useRecentShelf();
  // Playing a popular row makes this listener a returning one. Swapping the list
  // out from under the row they just tapped would lose their place in it.
  const [keepPopular, setKeepPopular] = useState(false);

  return (
    <>
      <RecentSearches onSearch={onSearch} />
      {!recentReady || recent.isLoading ? (
        // Not Popular: it would flash up before a returning listener's own list.
        <ShabadRowSkeletons />
      ) : recent.data?.length && !keepPopular ? (
        <RecentShelf limit={ROWS} />
      ) : (
        <Shelf title="Popular" sort="popular" limit={ROWS} onPlay={() => setKeepPopular(true)} />
      )}
      <RagisShelf />
    </>
  );
}

function RecentSearches({ onSearch }: { onSearch: (term: string) => void }) {
  const { terms, remove } = useRecentSearches();
  const [script] = useTitleScript();
  if (!terms.length) return null;

  return (
    <ul aria-label="Recent searches" className="flex flex-wrap gap-2">
      {terms.map((term) => (
        <li key={term} className="flex items-center rounded-full bg-accent pl-3 pr-1">
          <button
            type="button"
            onClick={() => onSearch(term)}
            className="flex h-8 min-w-0 items-center gap-1.5 hover:text-primary"
          >
            <History aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            <span className={cn('truncate text-sm', script === 'pa' && 'font-gurmukhi text-base')}>
              {term}
            </span>
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={script === 'pa' ? 'Remove this search' : `Remove ${term}`}
            onClick={() => remove(term)}
            className="size-6 rounded-full text-muted-foreground"
          >
            <X className="size-3" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
