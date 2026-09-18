/**
 * The tagging workbench's data.
 *
 * Separate from the player's queries because the shapes genuinely differ: the
 * player reads published renditions through `shabads`, the workbench reads raw
 * recordings and every draft on them, published or not.
 */
import { DONE_SLACK_SECONDS } from '@kp/core';
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
  /** Null when the length is unknowable — no filename slot, which is all of puratan. */
  untagged_seconds: z.number().nullish(),
  /** A tagger's mark that the rest is not shabads. Overrides the coverage measure. */
  tagged_done_at: z.string().nullish(),
  last_activity_at: z.string().nullish(),
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
export type Shelf = 'todo' | 'queued' | 'started' | 'done' | 'all';

/** How a shelf is ordered. */
export type Sort = 'recent' | 'shortest' | 'least' | 'random';

/**
 * Each shelf offers only the sorts it can answer, and its default must appear
 * in its own list or the ordering has no button showing it.
 */
export const SHELF_SORTS: Record<Shelf, Sort[]> = {
  todo: ['shortest', 'random'],
  queued: ['recent'],
  started: ['recent', 'least'],
  done: ['recent'],
  all: ['recent', 'shortest', 'random'],
};

export const SHELF_DEFAULT_SORT: Record<Shelf, Sort> = {
  todo: 'random',
  queued: 'recent',
  started: 'recent',
  done: 'recent',
  all: 'recent',
};

/**
 * Ids the Queued shelf will ask for at once.
 *
 * ~19 bytes each in the query string, so this stays far inside the 8 KB a proxy
 * will usually carry. Capped because the queue is only self-limiting while the
 * scanner is healthy: every id it stamps leaves the queue, so a scanner failing
 * on every track — which is what a missing ffmpeg did — lets requests pile up
 * until the URL is too long to send, and the shelf then breaks exactly when
 * somebody opens it to ask why.
 */
export const QUEUED_SHELF_MAX = 200;

const RECORDING_COLUMNS =
  'id,url,tree,title,artist_dir,artist_photo,date,raw_filename,' +
  'slot_start_sec,slot_end_sec,est_seconds,renditions,published,' +
  'untagged_seconds,tagged_done_at,last_activity_at';

/**
 * Escape a term for a PostgREST `or` list.
 *
 * Commas and parentheses delimit the list, so they have to go — and they become
 * wildcards rather than spaces, because a space is a character the filename
 * would then have to match in that exact position. Real filenames are full of
 * parentheses ("(5.35pm to 6.10pm)"), so pasting one in has to keep working.
 */
export function escapeFilterValue(term: string): string {
  return `%${term.replace(/[(),]/g, '%')}%`;
}

/** Tracks with a scan requested and not yet finished — the Queued shelf. */
export async function fetchQueuedScanIds(client: KpClient): Promise<string[]> {
  // Fetched rather than joined into the view: the table is small — one row per
  // request, ever — and a second query keeps the view SQL untouched. Without
  // scans.request, RLS returns nothing and the shelf is simply empty.
  const { data, error } = await client.from('scan_requests').select('track_id,done_at');
  if (error) return [];
  return ((data ?? []) as { track_id: string; done_at: string | null }[])
    .filter((r) => r.done_at === null)
    .map((r) => r.track_id);
}

export function useQueuedScanIds(client: KpClient, enabled: boolean) {
  return useQuery({
    queryKey: ['scan-requests'],
    queryFn: () => fetchQueuedScanIds(client),
    enabled,
  });
}

export interface RecordingFilters {
  shelf: Shelf;
  sort: Sort;
  tree: string | null;
  search: string;
  /** From `useQueuedScanIds` — only the Queued shelf reads it. */
  queuedIds: string[];
}

export async function listRecordings(
  client: KpClient,
  filters: RecordingFilters,
  from = 0
): Promise<{ items: Recording[]; hasMore: boolean }> {
  let query = client
    .from('recordings')
    .select(RECORDING_COLUMNS)
    .range(from, from + PAGE_SIZE - 1);

  if (filters.tree) query = query.eq('tree', filters.tree);

  /*
   * The two coverage arms must stay exact complements of each other, or a
   * recording lands on both shelves or on neither.
   *
   * "Done" demands coverage, not just a published row: two shabads out of a
   * 70-minute set is a recording somebody *started*, and it has to keep showing
   * up where the next tagger looks for unfinished work. A tagger's mark that the
   * rest is not shabads (tagged_done_at) overrides the coverage measure —
   * announcements and simran are minutes no amount of tagging will ever cover.
   * NULL untagged_seconds means the length is unknowable, and unknown reads as
   * still-open. Same predicate as coverageOpen() in @kp/core.
   */
  if (filters.shelf === 'todo') {
    query = query.eq('renditions', 0);
  } else if (filters.shelf === 'started') {
    query = query
      .gt('renditions', 0)
      .or(
        `published.eq.0,and(tagged_done_at.is.null,or(untagged_seconds.gt.${DONE_SLACK_SECONDS},untagged_seconds.is.null))`
      );
  } else if (filters.shelf === 'done') {
    query = query
      .gt('published', 0)
      .or(`untagged_seconds.lte.${DONE_SLACK_SECONDS},tagged_done_at.not.is.null`);
  } else if (filters.shelf === 'queued') {
    // Not a column on the view — the queue is its own table — so it filters by
    // the ids awaiting a scan. An empty list needs no special case: PostgREST
    // answers `in.()` with no rows, which is the right answer for an empty
    // queue.
    query = query.in('id', filters.queuedIds.slice(0, QUEUED_SHELF_MAX));
  }

  /*
   * The filename as well as the artist: `title` is null for almost every
   * recording, so the filename is the only place the date and the slot
   * ("5.35pm to 6.10pm") are written — and that is how a tagger looks for the
   * one recording somebody asked them about.
   */
  const term = filters.search.trim();
  if (term.length > 1) {
    const v = escapeFilterValue(term);
    query = query.or(`artist_dir.ilike.${v},raw_filename.ilike.${v},title.ilike.${v}`);
  }

  if (filters.sort === 'shortest') {
    // Shortest first is what lets somebody finish a recording in one sitting,
    // which is what keeps a volunteer coming back. Nulls last — an unknown
    // length is a worse bet than a known short one.
    query = query.order('est_seconds', { ascending: true, nullsFirst: false });
  } else if (filters.sort === 'least') {
    query = query.order('untagged_seconds', { ascending: true, nullsFirst: false });
  } else if (filters.sort === 'random') {
    // Without this the same finished recordings sit at the top of the Todo
    // shelf forever and two taggers arriving on the same day get handed the
    // same work. `id` is a sha1 of the URL, so ordering by it is arbitrary but
    // stable — a page boundary cannot shuffle underneath a scroll.
    query = query.order('id', { ascending: true });
  } else {
    query = query.order('last_activity_at', { ascending: false, nullsFirst: false });
  }

  const { data, error } = await query;
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

export function useRecordings(client: KpClient, filters: RecordingFilters) {
  return useInfiniteQuery({
    queryKey: ['recordings', filters.shelf, filters.sort, filters.tree, filters.search,
      // Only the Queued shelf depends on the ids, and keying every shelf on them
      // would refetch the whole queue whenever a scan finishes.
      filters.shelf === 'queued' ? filters.queuedIds.length : 0],
    queryFn: ({ pageParam }) => listRecordings(client, filters, pageParam as number),
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

/* ── Recording-level actions ──────────────────────────────────────────── */

/**
 * Mark a recording fully tagged, or undo it.
 *
 * Its own capability, not open to every contributor although tagging itself
 * is: the mark hides a recording from the In progress shelf for everyone, so a
 * wrong or hasty one buries work other taggers would have finished. That is a
 * review judgment.
 */
export async function setTaggedDone(
  client: KpClient,
  trackId: string,
  done: boolean
): Promise<void> {
  const { data, error } = await client
    .from('tracks')
    .update({ tagged_done_at: done ? new Date().toISOString() : null })
    .eq('id', trackId)
    // Same reason as the rendition writes: RLS filters a forbidden UPDATE out
    // rather than rejecting it, so without asking for the row back a refusal
    // looks exactly like success.
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Marking this recording is not permitted.');
}

/**
 * Ask the scanner to suggest shabads for a recording.
 *
 * Its own capability too. A queued scan is not free — the nightly workflow
 * budgets roughly thirty CPU-minutes per broadcast on a runner, three a night —
 * and this button is the only thing rationing it.
 */
export async function requestScan(client: KpClient, trackId: string): Promise<void> {
  const { data, error } = await client
    .from('scan_requests')
    .upsert({ track_id: trackId }, { onConflict: 'track_id', ignoreDuplicates: true })
    .select('track_id');
  if (error) throw error;
  // An ignored duplicate comes back empty and is not a failure: the recording
  // is already in the queue, which is what the tagger wanted.
  void data;
}

/** This recording's place in the scan queue, if it has one. */
export async function getScanRequest(
  client: KpClient,
  trackId: string
): Promise<{ done_at: string | null } | null> {
  const { data, error } = await client
    .from('scan_requests')
    .select('track_id,done_at')
    .eq('track_id', trackId)
    .maybeSingle();
  if (error) return null;
  return (data as { done_at: string | null } | null) ?? null;
}

export function useScanRequest(client: KpClient, trackId: string) {
  return useQuery({
    queryKey: ['scan-request', trackId],
    queryFn: () => getScanRequest(client, trackId),
    enabled: trackId.length > 0,
  });
}
