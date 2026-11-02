/**
 * Recent searches, remembered on this phone: the phone's half of
 * apps/player/src/lib/recent-searches.ts, over MMKV. The rules are @kp/core's.
 *
 * Saved when a search is used, never as it is typed: the debounce would fill
 * the list with fragments on the way to the word somebody meant.
 */
import { minSearchLength } from '@kp/api';
import { parseRecentSearches, withoutRecentSearch, withRecentSearch } from '@kp/core';
import { useEffect, useRef } from 'react';
import { useMMKVString } from 'react-native-mmkv';

import { mmkv } from './storage';
import { useTitleScript } from './title-script';

const KEY = 'kp:recent-searches';

export function useRecentSearches() {
  const [script] = useTitleScript();
  const [raw, setRaw] = useMMKVString(KEY, mmkv);

  return {
    terms: parseRecentSearches(raw)[script],
    save(term: string) {
      const trimmed = term.trim();
      if (trimmed.length < minSearchLength(script)) return;
      setRaw(JSON.stringify(withRecentSearch(parseRecentSearches(raw), trimmed, script)));
    },
    remove(term: string) {
      setRaw(JSON.stringify(withoutRecentSearch(parseRecentSearches(raw), term, script)));
    },
  };
}

/** Signing out hands the phone to whoever is next, so they do not inherit these. */
export function useClearRecentSearchesOnSignOut(userId: string | null) {
  const previous = useRef(userId);

  useEffect(() => {
    if (previous.current && !userId) mmkv.remove(KEY);
    previous.current = userId;
  }, [userId]);
}
