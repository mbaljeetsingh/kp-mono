/**
 * TanStack Query hooks — thin, on purpose.
 *
 * All the behaviour is in `queries.ts`; these only bind it to the cache. Both
 * React apps import from here, which is the one thing making web and mobile
 * React was worth doing for.
 */
import {
  useInfiniteQuery,
  useQuery,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { Playable } from '@kp/core';

import type { KpClient } from './client';
import { keys } from './keys';
import {
  listArtists,
  listShabads,
  otherRecordings,
  searchShabads,
  shabadsByArtist,
  shabadsByIds,
  PAGE_SIZE,
  type Page,
  type ShabadSort,
} from './queries';
import type { Artist } from './schemas';

/** Pages are addressed by row offset, which is what `.range()` wants. */
function pageParams() {
  return {
    initialPageParam: 0,
    getNextPageParam: (last: Page<Playable>, all: Page<Playable>[]) =>
      last.hasMore ? all.length * PAGE_SIZE : undefined,
  };
}

export function useShabads(
  client: KpClient,
  sort: ShabadSort = 'newest'
): UseInfiniteQueryResult<{ pages: Page<Playable>[] }> {
  return useInfiniteQuery({
    queryKey: keys.shabads.list({ sort }),
    queryFn: ({ pageParam }) => listShabads(client, pageParam as number, sort),
    ...pageParams(),
  });
}

export function useShabadsByArtist(client: KpClient, artist: string) {
  return useInfiniteQuery({
    queryKey: keys.shabads.byArtist(artist),
    queryFn: ({ pageParam }) => shabadsByArtist(client, artist, pageParam as number),
    enabled: artist.length > 0,
    ...pageParams(),
  });
}

/**
 * Search, held back until the term is worth a round trip.
 *
 * One character matches most of a 49k-row archive, which is a slow query for a
 * result nobody wanted.
 */
export function useSearch(client: KpClient, term: string) {
  const trimmed = term.trim();
  return useInfiniteQuery({
    queryKey: keys.shabads.search(trimmed),
    queryFn: ({ pageParam }) => searchShabads(client, trimmed, pageParam as number),
    enabled: trimmed.length >= 2,
    ...pageParams(),
  });
}

/** Other recordings of what is playing. Asks nothing until the rendition is linked. */
export function useOtherRecordings(
  client: KpClient,
  shabadId: number | null | undefined,
  exceptId: string | undefined
): UseQueryResult<Playable[]> {
  return useQuery({
    queryKey: keys.shabads.others(shabadId ?? 0, exceptId ?? ''),
    queryFn: () => otherRecordings(client, shabadId!, exceptId!),
    enabled: Boolean(shabadId && exceptId),
  });
}

/**
 * Rows for these recently played ids, in that order. The last rows stay up while
 * a play reorders the list, so it does not blink; but not once there are no ids.
 * A disabled query still shows its placeholder, so signing out left the account's
 * list on screen, under a heading saying it was kept on this device.
 */
export function useRecentShabads(
  client: KpClient,
  ids: readonly string[]
): UseQueryResult<Playable[]> {
  return useQuery({
    queryKey: keys.shabads.recent(ids),
    queryFn: () => shabadsByIds(client, [...ids]),
    enabled: ids.length > 0,
    placeholderData: (previous) => (ids.length > 0 ? previous : undefined),
  });
}

export function useArtists(client: KpClient): UseQueryResult<Artist[]> {
  return useQuery({
    queryKey: keys.artists.directory(),
    queryFn: () => listArtists(client),
    // The directory changes when the crawler runs, which is weekly.
    staleTime: 1000 * 60 * 60,
  });
}
