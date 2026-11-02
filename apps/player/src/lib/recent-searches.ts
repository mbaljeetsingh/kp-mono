/**
 * Recent searches, remembered on this device. The rules are @kp/core's.
 *
 * Saved when a search is used, never as it is typed: the debounce would fill
 * the list with fragments on the way to the word somebody meant.
 */
import { minSearchLength } from '@kp/api';
import {
  parseRecentSearches,
  recentSearchesLeftBehind,
  withoutRecentSearch,
  withRecentSearch,
  type RecentSearches,
} from '@kp/core';
import { useEffect } from 'react';
import { useLocalStorage } from 'usehooks-ts';

import { useTitleScript } from '~/lib/title-script';

const KEY = 'kp:recent-searches';
const OWNER_KEY = 'kp:recent-searches-owner';
const NONE: RecentSearches = { en: [], pa: [] };

export function useRecentSearches() {
  const [script] = useTitleScript();
  const [searches, setSearches] = useLocalStorage<RecentSearches>(KEY, NONE, {
    deserializer: parseRecentSearches,
  });

  return {
    terms: searches[script],
    save(term: string) {
      const trimmed = term.trim();
      if (trimmed.length < minSearchLength(script)) return;
      setSearches((current) => withRecentSearch(current, trimmed, script));
    },
    remove(term: string) {
      setSearches((current) => withoutRecentSearch(current, term, script));
    },
  };
}

/** Signing out hands the device to whoever is next, so they do not inherit these. */
export function useClearRecentSearchesOnSignOut(userId: string | null, loading: boolean) {
  const [, setSearches] = useLocalStorage<RecentSearches>(KEY, NONE, {
    deserializer: parseRecentSearches,
  });
  const [owner, setOwner] = useLocalStorage<string | null>(OWNER_KEY, null);

  useEffect(() => {
    // Signed out is what a session looks like before it has been read.
    if (loading) return;
    if (recentSearchesLeftBehind(owner, userId)) setSearches(NONE);
    if (owner !== userId) setOwner(userId);
  }, [owner, userId, loading, setSearches, setOwner]);
}
