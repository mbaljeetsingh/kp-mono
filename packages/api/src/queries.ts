/**
 * The queries themselves — plain async functions over a client.
 *
 * Deliberately not hooks. A hook cannot be called from a route loader, a
 * prefetch, or a test, and every one of those wants the same query. The hooks
 * in `hooks.ts` are thin wrappers around these.
 */
import { toPlayable, type Playable } from '@kp/core';

import type { KpClient } from './client';
import { artistSchema, parseRows, shabadRowSchema, type Artist } from './schemas';

/** Rows per page. The archive is far too large to fetch whole. */
export const PAGE_SIZE = 50;

export interface Page<T> {
  items: T[];
  /**
   * False once a short page comes back. The server has already told us the
   * list ended, so asking again would be a round trip to learn nothing.
   */
  hasMore: boolean;
}

const SHABAD_COLUMNS =
  'id,name,url,track_id,tree,artist,artist_display,artist_photo,raag,taal,' +
  'shabad_id,main_verse_id,line_timings,start_sec,end_sec,duration_sec,play_count,date,created_at';

/** Every shabad query lands here, so parsing and paging are defined once. */
function toPage(data: unknown[] | null): Page<Playable> {
  const { rows } = parseRows(shabadRowSchema, data ?? []);
  return { items: rows.map(toPlayable), hasMore: (data?.length ?? 0) >= PAGE_SIZE };
}

function shabads(client: KpClient, from: number) {
  return client
    .from('shabads')
    .select(SHABAD_COLUMNS)
    .range(from, from + PAGE_SIZE - 1);
}

export async function listShabads(client: KpClient, from = 0): Promise<Page<Playable>> {
  const { data, error } = await shabads(client, from).order('created_at', { ascending: false });
  if (error) throw error;
  return toPage(data);
}

export async function shabadsByArtist(
  client: KpClient,
  artist: string,
  from = 0
): Promise<Page<Playable>> {
  const { data, error } = await shabads(client, from)
    .eq('artist', artist)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return toPage(data);
}

/**
 * Title or artist, case-insensitive.
 *
 * `%` and `_` are escaped: PostgREST passes the pattern through to ILIKE, so a
 * listener searching for a literal underscore would otherwise match anything.
 */
export async function searchShabads(
  client: KpClient,
  term: string,
  from = 0
): Promise<Page<Playable>> {
  const like = `%${term.replace(/[%_]/g, (c) => `\\${c}`)}%`;
  const { data, error } = await shabads(client, from).or(
    `name.ilike.${like},artist_display.ilike.${like}`
  );
  if (error) throw error;
  return toPage(data);
}

export async function listArtists(client: KpClient): Promise<Artist[]> {
  const { data, error } = await client.rpc('artist_directory');
  if (error) throw error;
  return parseRows(artistSchema, (data as unknown[]) ?? []).rows;
}
