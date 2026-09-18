/**
 * BaniDB search.
 *
 * Shared by the tagging workbench, where it links a shabad to a rendition, and
 * by the player's read-along, where a listener on a live broadcast can look up
 * what they are hearing for themselves.
 */
import { useQuery } from '@tanstack/react-query';

/**
 * `searchtype` 0 is BaniDB's first-letter search and accepts both Gurmukhi and
 * the roman keys that map onto it; 7 searches the English translation and
 * returns nothing for Gurmukhi input. Punjabi is the default because that is
 * how kirtan is looked up — you hear a line and type its initials.
 */
export const SEARCH_TYPES = [
  { key: 0, label: 'Punjabi' },
  { key: 7, label: 'English' },
] as const;

export interface BaniDbHit {
  shabadId: number;
  verseId: number;
  verse?: { unicode?: string; gurmukhi?: string };
  transliteration?: { english?: string };
  translation?: { en?: { bdb?: string } };
  source?: { english?: string };
  writer?: { english?: string };
  raag?: { english?: string };
}

export async function searchBaniDb(
  base: string,
  term: string,
  searchType: number
): Promise<BaniDbHit[]> {
  const res = await fetch(
    `${base}/search/${encodeURIComponent(term)}?searchtype=${searchType}`
  );
  if (!res.ok) throw new Error(`BaniDB returned ${res.status}`);
  const json = (await res.json()) as { verses?: BaniDbHit[] };
  // Twelve is enough to recognise the line without turning the panel into a
  // second list to read.
  return (json.verses ?? []).slice(0, 12);
}

export function useBaniDbSearch(base: string, term: string, searchType: number) {
  const trimmed = term.trim();
  return useQuery({
    queryKey: ['banidb', 'search', searchType, trimmed],
    queryFn: () => searchBaniDb(base, trimmed, searchType),
    // One or two characters match most of the corpus, which is a slow request
    // for a result nobody wanted.
    enabled: trimmed.length >= 2,
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });
}
