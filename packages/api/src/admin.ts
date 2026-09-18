/**
 * The tagging workbench's data.
 *
 * Separate from the player's queries because the shapes genuinely differ: the
 * player reads published renditions through `shabads`, the workbench reads raw
 * recordings and every draft on them, published or not.
 */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import type { KpClient } from './client';
// One page size for the whole app — a queue that pages differently from the
// player is a difference nobody chose.
import { PAGE_SIZE } from './queries';
import { parseRows } from './schemas';

export const recordingSchema = z.object({
  id: z.string(),
  url: z.string(),
  tree: z.string(),
  title: z.string().nullish(),
  artist_dir: z.string().nullish(),
  artist_photo: z.string().nullish(),
  date: z.string().nullish(),
  raw_filename: z.string().nullish(),
  slot_start_sec: z.number().nullish(),
  slot_end_sec: z.number().nullish(),
  est_seconds: z.number().nullish(),
  renditions: z.number(),
  published: z.number(),
});

export const renditionSchema = z.object({
  id: z.string(),
  track_id: z.string(),
  name: z.string(),
  start_sec: z.union([z.number(), z.string()]),
  end_sec: z.union([z.number(), z.string()]),
  status: z.string(),
  shabad_id: z.number().nullish(),
  main_verse_id: z.number().nullish(),
  raag: z.string().nullish(),
  artist: z.string().nullish(),
});

export type Recording = z.infer<typeof recordingSchema>;
export type Rendition = z.infer<typeof renditionSchema>;

/** Which shelf of the queue. Each is a different question about coverage. */
export type Shelf = 'todo' | 'progress' | 'done';

const RECORDING_COLUMNS =
  'id,url,tree,title,artist_dir,artist_photo,date,raw_filename,' +
  'slot_start_sec,slot_end_sec,est_seconds,renditions,published';

export async function listRecordings(
  client: KpClient,
  shelf: Shelf,
  tree: string | null,
  from = 0
): Promise<{ items: Recording[]; hasMore: boolean }> {
  let query = client
    .from('recordings')
    .select(RECORDING_COLUMNS)
    .range(from, from + PAGE_SIZE - 1);

  if (tree) query = query.eq('tree', tree);

  // Todo is untouched, in-progress has drafts, done has published work. The
  // counts come from the view, which deliberately runs as owner so another
  // contributor's drafts are visible — otherwise two people segment the same
  // recording.
  if (shelf === 'todo') query = query.eq('renditions', 0);
  if (shelf === 'progress') query = query.gt('renditions', 0).eq('published', 0);
  if (shelf === 'done') query = query.gt('published', 0);

  // Shortest first: a recording that finishes in one sitting is what keeps a
  // volunteer coming back. Nulls last — an unknown length is a worse bet than
  // a known short one.
  const { data, error } = await query.order('est_seconds', {
    ascending: true,
    nullsFirst: false,
  });
  if (error) throw error;

  const { rows } = parseRows(recordingSchema, data ?? []);
  return { items: rows, hasMore: (data?.length ?? 0) >= PAGE_SIZE };
}

export async function listRenditions(client: KpClient, trackId: string): Promise<Rendition[]> {
  const { data, error } = await client
    .from('renditions')
    .select('id,track_id,name,start_sec,end_sec,status,shabad_id,main_verse_id,raag,artist')
    .eq('track_id', trackId)
    .order('start_sec', { ascending: true });
  if (error) throw error;
  return parseRows(renditionSchema, data ?? []).rows;
}

export async function getRecording(client: KpClient, id: string): Promise<Recording | null> {
  const { data, error } = await client
    .from('recordings')
    .select(RECORDING_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const parsed = recordingSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export function useRecordings(client: KpClient, shelf: Shelf, tree: string | null) {
  return useInfiniteQuery({
    queryKey: ['recordings', shelf, tree],
    queryFn: ({ pageParam }) => listRecordings(client, shelf, tree, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.hasMore ? all.length * PAGE_SIZE : undefined),
  });
}

export function useRecording(client: KpClient, id: string) {
  return useQuery({ queryKey: ['recording', id], queryFn: () => getRecording(client, id) });
}

export function useRenditions(client: KpClient, trackId: string) {
  return useQuery({
    queryKey: ['renditions', trackId],
    queryFn: () => listRenditions(client, trackId),
    enabled: trackId.length > 0,
  });
}
