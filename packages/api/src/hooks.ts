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
import { groupByLine, type Playable, type TitleScript } from '@kp/core';

import { MIN_FIRST_LETTERS } from './banidb';
import type { KpClient } from './client';
import { keys } from './keys';
import {
  listArtists,
  listShabads,
  otherRecordings,
  searchPage,
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
 * How much a listener must type. Punjabi has only Gurbani to go on, through its
 * first letters or words; roman has ragis too, which two letters can already narrow.
 */
export function minSearchLength(script: TitleScript): number {
  return script === 'pa' ? MIN_FIRST_LETTERS : 2;
}

/**
 * Search, held back until the term is worth a round trip, with its recordings
 * gathered under the lines that found them.
 *
 * One character matches most of a 49k-row archive, which is a slow query for a
 * result nobody wanted.
 *
 * The last results stay until the new ones come, unless there were none or the
 * language changed; `term` on each page says which term they answered, which is
 * the term their lines are marked against.
 */
export function useSearchResults(client: KpClient, term: string, script: TitleScript) {
  const trimmed = term.trim();
  const results = useInfiniteQuery({
    queryKey: keys.shabads.search(trimmed, script),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => ({
      ...(await searchPage(client, trimmed, script, pageParam)),
      term: trimmed,
    }),
    getNextPageParam: (last, all) => (last.hasMore ? all.length * PAGE_SIZE : undefined),
    enabled: trimmed.length >= minSearchLength(script),
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[3] === script && previous?.pages[0]?.items.length
        ? previous
        : undefined,
  });
  const pages = results.data?.pages ?? [];
  const grouped = groupByLine(
    pages.flatMap((page) => page.items),
    pages.flatMap((page) => page.lines),
    pages[0]?.term ?? trimmed,
    script
  );
  return { ...grouped, results };
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
 * a play reorders the list, so it does not blink; but only for the same listener.
 * The placeholder outlives the ids: signing out left the account's list on screen,
 * and the next guest play would have brought it back. Hence `userId` in the key.
 */
export function useRecentShabads(
  client: KpClient,
  userId: string | null,
  ids: readonly string[]
): UseQueryResult<Playable[]> {
  return useQuery({
    queryKey: keys.shabads.recent(userId, ids),
    queryFn: () => shabadsByIds(client, [...ids]),
    enabled: ids.length > 0,
    placeholderData: (previous, previousQuery) =>
      ids.length > 0 && previousQuery?.queryKey[2] === userId ? previous : undefined,
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
