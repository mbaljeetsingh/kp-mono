/**
 * What this listener searched for lately, offered back on the empty Search page.
 *
 * Kept on the device and nowhere else: what someone searches for in kirtan is
 * theirs, and listening needs no account. Each app stores the JSON its own way.
 *
 * Each language keeps its own list. A Punjabi term is GurbaniLipi keystrokes,
 * which read as nonsense among English ones and search for nothing there.
 */
import type { TitleScript } from './title-script';

export const RECENT_SEARCH_LIMIT = 5;

export type RecentSearches = Record<TitleScript, readonly string[]>;

const NONE: RecentSearches = { en: [], pa: [] };

function terms(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((term): term is string => typeof term === 'string' && term.length > 0)
    .slice(0, RECENT_SEARCH_LIMIT);
}

/** Whatever was stored, as a list. Anything unreadable reads as no history. */
export function parseRecentSearches(raw: string | null | undefined): RecentSearches {
  if (!raw) return NONE;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<TitleScript, unknown>> | null;
    return { en: terms(parsed?.en), pa: terms(parsed?.pa) };
  } catch {
    return NONE;
  }
}

/** Case separates GurbaniLipi keys (`h` and `H` are different letters), but not English. */
function same(a: string, b: string, script: TitleScript): boolean {
  return script === 'pa' ? a === b : a.toLowerCase() === b.toLowerCase();
}

/** The lists with this term at the front of its language's. */
export function withRecentSearch(
  searches: RecentSearches,
  term: string,
  script: TitleScript
): RecentSearches {
  const list = searches[script].filter((other) => !same(other, term, script));
  return { ...searches, [script]: [term, ...list].slice(0, RECENT_SEARCH_LIMIT) };
}

export function withoutRecentSearch(
  searches: RecentSearches,
  term: string,
  script: TitleScript
): RecentSearches {
  return { ...searches, [script]: searches[script].filter((other) => other !== term) };
}
