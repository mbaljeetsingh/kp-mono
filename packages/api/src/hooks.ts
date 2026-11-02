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
  useQueryClient,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { Playable, TitleScript } from '@kp/core';

import { firstLetterLines, MIN_FIRST_LETTERS, shabadIdsOf, type LineMatches } from './banidb';
import type { KpClient } from './client';
import { keys } from './keys';
import {
  listArtists,
  listShabads,
  otherRecordings,
  searchShabads,
  shabadsWithIds,
  shabadsByArtist,
  shabadsByIds,
  PAGE_SIZE,
  type Page,
  type ShabadSort,
} from './queries';
import type { Artist } from './schemas';

const MAX_FILTERED_SHABADS = 240;

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

type SearchMatches = LineMatches & {
  /** BaniDB could not be asked, so only titles and ragis were searched. */
  degraded: boolean;
};

const NO_MATCHES: SearchMatches = { lines: [], partial: false, degraded: false };

interface SearchPageParam {
  /** Recordings of shabads with a line opening on the letters come first. */
  stage: 'opening' | 'rest';
  from: number;
  matches: SearchMatches | null;
}

/**
 * How much a listener must type. Punjabi has only first letters to go on; roman
 * has titles and ragis too, which two letters can already narrow.
 */
export function minSearchLength(script: TitleScript): number {
  return script === 'pa' ? MIN_FIRST_LETTERS : 2;
}

/**
 * Search, held back until the term is worth a round trip.
 *
 * One character matches most of a 49k-row archive, which is a slow query for a
 * result nobody wanted.
 *
 * BaniDB is asked once per term, through the cache, not once per page. If it is
 * down, roman search still has titles and ragis to offer, so that is what it
 * shows, flagged `degraded`; Punjabi has nothing else, so the failure surfaces
 * as an error. The ranking is two queries because PostgREST cannot order by
 * membership of a list.
 */
export function useSearch(client: KpClient, base: string, term: string, script: TitleScript) {
  const trimmed = term.trim();
  const queryClient = useQueryClient();
  // A space means words, which no first-letter search can match.
  const initials = trimmed.length >= MIN_FIRST_LETTERS && !/\s/.test(trimmed);
  return useInfiniteQuery({
    queryKey: keys.shabads.search(trimmed, script),
    initialPageParam: { stage: 'opening', from: 0, matches: null } as SearchPageParam,
    queryFn: async ({ pageParam }) => {
      const matches =
        pageParam.matches ??
        (initials
          ? await queryClient
              .fetchQuery({
                queryKey: keys.banidb.lines(script, trimmed),
                queryFn: () => firstLetterLines(base, trimmed, script),
                staleTime: 1000 * 60 * 10,
              })
              .then((found): SearchMatches => ({ ...found, degraded: false }))
              .catch((failure: unknown): SearchMatches => {
                if (script === 'pa') throw failure;
                return { ...NO_MATCHES, degraded: true };
              })
          : NO_MATCHES);
      const opening = shabadIdsOf(matches.lines.filter((line) => line.atStart));
      // The listed and the excluded share one query string, and past about 250
      // ids it crosses the gateway's limit (`shabadsByIds`). A term this common
      // has `partial` asking for another letter anyway.
      const others = shabadIdsOf(matches.lines)
        .filter((id) => !opening.includes(id))
        .slice(0, MAX_FILTERED_SHABADS - opening.length);

      const rest = (from: number) => searchShabads(client, trimmed, script, others, from, opening);

      if (pageParam.stage === 'opening' && opening.length) {
        const page = await shabadsWithIds(client, opening, pageParam.from);
        if (page.hasMore) {
          const next: SearchPageParam = {
            stage: 'opening',
            from: pageParam.from + PAGE_SIZE,
            matches,
          };
          return { ...page, ...matches, matches, next };
        }
        const after = await rest(0);
        const next: SearchPageParam | undefined = after.hasMore
          ? { stage: 'rest', from: PAGE_SIZE, matches }
          : undefined;
        return { ...after, items: [...page.items, ...after.items], ...matches, matches, next };
      }

      const page = await rest(pageParam.from);
      const next: SearchPageParam | undefined = page.hasMore
        ? { stage: 'rest', from: pageParam.from + PAGE_SIZE, matches }
        : undefined;
      return { ...page, ...matches, matches, next };
    },
    // Every page keeps the first page's matches. Asked again, BaniDB could fail
    // or expire partway, and the offset would then count a different result set.
    getNextPageParam: (last) => last.next,
    enabled: trimmed.length >= minSearchLength(script),
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
