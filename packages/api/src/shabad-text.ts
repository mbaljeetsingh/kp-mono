/**
 * Shabad text from BaniDB, for read-along.
 *
 * The base URL is injected rather than read: in the browser it is a same-origin
 * proxy, because BaniDB caches its allow-origin header across ports and a
 * direct call from a dev port gets a response cached for another origin.
 *
 * Cached per shabad id for the session: the same shabad recurs constantly
 * across renditions, and re-fetching it on every play would be both slow and
 * rude to someone else's API.
 */
import { useQuery } from '@tanstack/react-query';

import { keys } from './keys';

export interface ShabadVerse {
  verseId: number;
  verse?: { unicode?: string; gurmukhi?: string };
  translation?: { en?: { bdb?: string; ssk?: string } };
  transliteration?: { english?: string };
}

export interface ShabadText {
  verses: ShabadVerse[];
}

export async function fetchShabadText(base: string, shabadId: number): Promise<ShabadText> {
  const res = await fetch(`${base}/shabads/${shabadId}`);
  if (!res.ok) throw new Error(`BaniDB returned ${res.status}`);
  return (await res.json()) as ShabadText;
}

export function useShabadText(base: string, shabadId: number | null | undefined) {
  return useQuery({
    queryKey: keys.shabadText(shabadId ?? 0),
    queryFn: () => fetchShabadText(base, shabadId!),
    enabled: Boolean(shabadId),
    // The text of a shabad does not change. Holding it for the session is the
    // whole point.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
}
