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

/* ── Writing ──────────────────────────────────────────────────────────── */

/**
 * What a contributor actually fills in.
 *
 * `name` is the only required tag, and deliberately so: typing what you hear
 * needs no Gurbani literacy, which is what keeps the highest-volume task open
 * to anyone. Everything else is additive.
 */
export const draftSchema = z
  .object({
    track_id: z.string().min(1),
    name: z.string().trim().min(1, 'Give the shabad a name'),
    start_sec: z.number().min(0),
    end_sec: z.number(),
    shabad_id: z.number().nullish(),
    main_verse_id: z.number().nullish(),
    raag: z.string().trim().nullish(),
    artist: z.string().trim().nullish(),
  })
  // Mirrors the `rendition_ordered` check constraint, so a bad range is caught
  // in the form rather than coming back as a Postgres error nobody can read.
  .refine((d) => d.end_sec > d.start_sec, {
    message: 'The end must come after the start',
    path: ['end_sec'],
  });

export type Draft = z.infer<typeof draftSchema>;

/**
 * Create a rendition.
 *
 * `created_by` is set here because RLS insists on it: the insert policy checks
 * `created_by = auth.uid()`, so omitting it is not a missing default — it is a
 * rejected row.
 *
 * `status` is never passed. A new rendition is a draft; publishing is a
 * separate act needing a separate permission, and conflating them is how a
 * contributor would accidentally push unreviewed work into the player.
 */
export async function createRendition(
  client: KpClient,
  draft: Draft,
  userId: string
): Promise<Rendition> {
  const parsed = draftSchema.parse(draft);
  const { data, error } = await client
    .from('renditions')
    .insert({ ...parsed, created_by: userId })
    .select('id,track_id,name,start_sec,end_sec,status,shabad_id,main_verse_id,raag,artist')
    .single();
  if (error) throw error;
  return renditionSchema.parse(data);
}

export async function updateRendition(
  client: KpClient,
  id: string,
  draft: Draft
): Promise<Rendition> {
  const parsed = draftSchema.parse(draft);
  const { data, error } = await client
    .from('renditions')
    .update({ ...parsed, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id,track_id,name,start_sec,end_sec,status,shabad_id,main_verse_id,raag,artist')
    .single();
  if (error) throw error;
  return renditionSchema.parse(data);
}

/**
 * Publish or unpublish.
 *
 * Its own function rather than a field on the update, because it is its own
 * permission and its own decision — and because unpublishing is how a bad tag
 * gets pulled out of the player without deleting the work behind it.
 */
export async function setRenditionStatus(
  client: KpClient,
  id: string,
  status: 'draft' | 'published'
): Promise<void> {
  const { data, error } = await client
    .from('renditions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    // `select('id')` is what makes a refused write visible. RLS *filters* rows
    // out of an UPDATE rather than rejecting it, so without asking for the
    // changed row back a forbidden publish returns no error and looks exactly
    // like a successful one — the button would report success and the shabad
    // would never appear in the player.
    .select('id');
  if (error) throw error;
  if (!data?.length) {
    throw new Error('That change was not permitted — your trust level may not allow it.');
  }
}

export async function deleteRendition(client: KpClient, id: string): Promise<void> {
  // Same as the status change: a DELETE the policy filters out succeeds with
  // nothing deleted.
  const { data, error } = await client.from('renditions').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) {
    throw new Error('That delete was not permitted.');
  }
}


/**
 * Whether this row can be promoted to published by this account.
 *
 * Reviewers can do it to anything. Publish-without-review can only do it to
 * their own unpublished work, and only once: the UPDATE policy stops matching
 * the row the moment it goes published, which is why those accounts get a
 * one-way button where a reviewer gets a two-state control.
 */
export function canPublishRendition(
  row: { status: string; created_by?: string | null },
  perms: { review: boolean; publish: boolean },
  // Undefined as well as null: "we do not know who you are yet" must fall
  // through to the same answer as "you are nobody" — no button.
  userId: string | null | undefined
): boolean {
  if (!perms.publish || row.status === 'published') return false;
  return perms.review || row.created_by === userId;
}

/** Everything a contributor has proposed and nobody has published yet. */
export interface PendingRendition extends Rendition {
  created_by: string | null;
  created_at: string;
  tracks: { artist_dir: string | null; date: string | null; url: string; raw_filename: string | null } | null;
}

export async function fetchPending(client: KpClient): Promise<PendingRendition[]> {
  const { data, error } = await client
    .from('renditions')
    .select('*, tracks(artist_dir, date, url, raw_filename)')
    .neq('status', 'published')
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as PendingRendition[];
}

export function usePending(client: KpClient, enabled: boolean) {
  return useQuery({
    queryKey: ['pending'],
    queryFn: () => fetchPending(client),
    enabled,
  });
}
