/**
 * Playlists — account-only.
 *
 * Favorites work without an account because losing one browser's list costs a
 * few taps to rebuild. A named collection someone spent an hour assembling is
 * not something to keep in localStorage and hope, so playlists exist only for
 * signed-in listeners; the UI asks for a sign-in rather than degrading.
 */
import { toPlayable, type Playable } from '@kp/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import type { KpClient } from './client';
import { keys } from './keys';
import { parseRows, shabadRowSchema } from './schemas';

export const playlistSchema = z.object({
  id: z.string(),
  name: z.string(),
  created_at: z.string().nullish(),
  /** Rows in the playlist, from an embedded aggregate rather than a second request. */
  count: z.number().default(0),
});

export type Playlist = z.infer<typeof playlistSchema>;

interface RawPlaylist {
  id: string;
  name: string;
  created_at: string | null;
  playlist_items?: { count: number }[];
}

export async function fetchPlaylists(client: KpClient): Promise<Playlist[]> {
  // `playlist_items(count)` is a PostgREST aggregate embed over the foreign
  // key — the count comes back with the parent row, so the list page needs one
  // request rather than one per playlist.
  const { data, error } = await client
    .from('playlists')
    .select('id, name, created_at, playlist_items(count)')
    .order('created_at', { ascending: false });
  // Throwing keeps the current list on screen. Returning [] would show
  // "No playlists yet" to someone who has ten, which reads as data loss.
  if (error) throw error;
  return ((data ?? []) as RawPlaylist[]).map((p) => ({
    id: p.id,
    name: p.name,
    created_at: p.created_at,
    count: p.playlist_items?.[0]?.count ?? 0,
  }));
}

export async function getPlaylist(client: KpClient, id: string) {
  const { data, error } = await client
    .from('playlists')
    .select('id, name, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; name: string; created_at: string | null } | null;
}

/** One playlist's shabads, in playlist order, ready to render and play. */
export async function fetchPlaylistItems(
  client: KpClient,
  playlistId: string
): Promise<Playable[]> {
  const { data, error } = await client
    .from('playlist_shabads')
    .select('*')
    .eq('playlist_id', playlistId)
    .order('position');
  if (error) throw error;
  return parseRows(shabadRowSchema, data ?? []).rows.map(toPlayable);
}

export async function createPlaylist(client: KpClient, userId: string, name: string) {
  const { data, error } = await client
    .from('playlists')
    .insert({ user_id: userId, name: name.trim() })
    .select('id, name, created_at')
    .single();
  if (error) throw error;
  return {
    ...(data as { id: string; name: string; created_at: string | null }),
    count: 0,
  };
}

export async function renamePlaylist(client: KpClient, id: string, name: string) {
  const { error } = await client.from('playlists').update({ name: name.trim() }).eq('id', id);
  if (error) throw error;
}

export async function deletePlaylist(client: KpClient, id: string) {
  const { error } = await client.from('playlists').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Add a shabad, ignoring a repeat add rather than erroring on the primary key.
 *
 * Resolves to whether a row was actually inserted. An ignored duplicate comes
 * back as an empty array and that is the only signal nothing happened — the
 * request still succeeds. Treating every call as an insert left the list page
 * claiming "2 shabads" over a one-row playlist until the next reload.
 */
export async function addPlaylistItem(
  client: KpClient,
  playlistId: string,
  renditionId: string
): Promise<boolean> {
  const { data, error } = await client
    .from('playlist_items')
    .upsert(
      { playlist_id: playlistId, rendition_id: renditionId },
      { onConflict: 'playlist_id,rendition_id', ignoreDuplicates: true }
    )
    .select('rendition_id');
  if (error) throw error;
  return Boolean(data?.length);
}

export async function removePlaylistItem(
  client: KpClient,
  playlistId: string,
  renditionId: string
) {
  const { error } = await client
    .from('playlist_items')
    .delete()
    .eq('playlist_id', playlistId)
    .eq('rendition_id', renditionId);
  if (error) throw error;
}

/* ── Hooks ────────────────────────────────────────────────────────────── */

export function usePlaylists(client: KpClient, signedIn: boolean) {
  return useQuery({
    queryKey: keys.playlists.all,
    queryFn: () => fetchPlaylists(client),
    enabled: signedIn,
  });
}

export function usePlaylist(client: KpClient, id: string) {
  return useQuery({
    queryKey: keys.playlists.one(id),
    queryFn: () => getPlaylist(client, id),
    enabled: id.length > 0,
  });
}

export function usePlaylistItems(client: KpClient, id: string) {
  return useQuery({
    queryKey: [...keys.playlists.one(id), 'items'],
    queryFn: () => fetchPlaylistItems(client, id),
    enabled: id.length > 0,
  });
}

/** Every mutation invalidates the list, so counts and names never drift. */
export function usePlaylistMutations(client: KpClient, userId: string | null) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.playlists.all });

  return {
    create: useMutation({
      mutationFn: (name: string) => createPlaylist(client, userId!, name),
      onSuccess: invalidate,
    }),
    rename: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) => renamePlaylist(client, id, name),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deletePlaylist(client, id),
      onSuccess: invalidate,
    }),
    addItem: useMutation({
      mutationFn: ({ playlistId, renditionId }: { playlistId: string; renditionId: string }) =>
        addPlaylistItem(client, playlistId, renditionId),
      // Both, like removeItem: the list page reads the count and the playlist
      // page reads the rows. Invalidating only the list left a shabad added
      // from the sheet missing from the playlist open behind it until reload.
      onSuccess: (_data, vars) => {
        void invalidate();
        void queryClient.invalidateQueries({
          queryKey: [...keys.playlists.one(vars.playlistId), 'items'],
        });
      },
    }),
    removeItem: useMutation({
      mutationFn: ({ playlistId, renditionId }: { playlistId: string; renditionId: string }) =>
        removePlaylistItem(client, playlistId, renditionId),
      onSuccess: (_data, vars) => {
        void invalidate();
        void queryClient.invalidateQueries({
          queryKey: [...keys.playlists.one(vars.playlistId), 'items'],
        });
      },
    }),
  };
}
