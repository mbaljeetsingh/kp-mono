/**
 * Recently played, in the listener's account as well as on the device.
 *
 * The device's list stays the one the app reads, signed in or not: the shelf has
 * to work with no connection, and a play must not wait on a request. Signed in,
 * this keeps the two in step.
 *
 * A marker in storage says the device's list has all been handed over to this
 * account. Without it the device knows something the account does not (a guest
 * signing in, or a play that failed to send) so its list goes first and is sent
 * up. With it the account may know better, from another phone, so its list goes
 * first. Stored ids have no times to compare, and this is the one fact needed.
 */
import { chunk, mergeRecent, playedSince, RECENT_LIMIT } from '@kp/core';
import { useEffect, useRef } from 'react';

import { toError, type KpClient } from './client';
import type { FavoritesStorage } from './favorites';

const SYNCED_KEY = 'kp:recent-synced';

/** The player store, as far as this needs it. @kp/api does not depend on @kp/playback. */
export interface RecentStore {
  getState(): {
    recentIds: readonly string[];
    recentReady: boolean;
    setRecent(ids: readonly string[]): void;
  };
  subscribe(listener: () => void): () => void;
}

async function readRemote(client: KpClient): Promise<string[]> {
  const { data, error } = await client
    .from('recent_plays')
    .select('rendition_id')
    .order('played_at', { ascending: false })
    .limit(RECENT_LIMIT);
  if (error) throw toError(error);
  return ((data ?? []) as { rendition_id: string }[]).map((r) => r.rendition_id);
}

/**
 * Newest first, a second apart so the order survives. Filtered through `shabads`
 * first as migrateLocalFavorites is: one rendition unpublished since it was
 * played would otherwise fail the whole write on its foreign key.
 */
async function sendAll(client: KpClient, userId: string, ids: readonly string[]) {
  if (!ids.length) return;
  const lookups = await Promise.all(
    chunk([...ids]).map((batch) => client.from('shabads').select('id').in('id', batch))
  );
  const failed = lookups.find((r) => r.error);
  if (failed?.error) throw toError(failed.error);
  const live = new Set(lookups.flatMap((r) => (r.data ?? []) as { id: string }[]).map((r) => r.id));
  const now = Date.now();
  const rows = ids
    .filter((id) => live.has(id))
    .map((id, i) => ({
      user_id: userId,
      rendition_id: id,
      played_at: new Date(now - i * 1000).toISOString(),
    }));
  if (!rows.length) return;
  const { error } = await client.from('recent_plays').upsert(rows);
  if (error) throw toError(error);
}

export function useRecentSync(
  client: KpClient,
  userId: string | null,
  store: RecentStore,
  storage: FavoritesStorage
) {
  const previous = useRef<string | null>(null);

  useEffect(() => {
    const signedOutFrom = previous.current;
    previous.current = userId;

    if (!userId) {
      // Their list goes with them, as their saved shabads do. Left behind on a
      // shared phone it would be handed to whoever signs in next. Only on a real
      // sign-out: at launch with no session this is simply a guest's own list.
      if (signedOutFrom) {
        store.getState().setRecent([]);
        void storage.setItem(SYNCED_KEY, '');
      }
      return;
    }

    let live = true;
    let started = false;
    let synced = false;
    let sent: string | undefined;

    let failed = false;
    let startHead: string | undefined;

    async function settle(id: string, local: readonly string[]) {
      const handedOver = (await storage.getItem(SYNCED_KEY)) === id;
      const remote = await readRemote(client);
      if (handedOver) return mergeRecent(remote, local);
      await sendAll(client, id, local);
      // Signed out meanwhile: that cleared the marker, and it has to stay cleared.
      if (live) await storage.setItem(SYNCED_KEY, id);
      return mergeRecent(local, remote);
    }

    function begin(id: string) {
      started = true;
      const local = store.getState().recentIds;
      startHead = local[0];
      settle(id, local)
        .then((merged) => {
          if (!live) return;
          // Anything played while that was on the wire is newer than either list,
          // and is left for the subscription below to send. Not "whatever merged
          // lacks": merged is capped, so an old play cut by the cap would come back
          // to the top as new, and be sent as played just now.
          sent = merged[0];
          const fresh = playedSince(local, store.getState().recentIds);
          store.getState().setRecent(mergeRecent(fresh, merged));
          synced = true;
        })
        .catch(() => {
          // Nothing lost: the device keeps its list. The marker stays as it was, so
          // one launch with no signal does not make this device's list outrank
          // newer plays from another; a play after this clears it, below. The table
          // not being there yet lands here too.
          failed = true;
        });
    }

    if (store.getState().recentReady) begin(userId);

    // A plain subscription, not a selector: the store changes ten times a second
    // during playback, and nothing here should render because of that.
    const unsubscribe = store.subscribe(() => {
      const { recentIds, recentReady } = store.getState();
      if (!started && recentReady) begin(userId);
      const head = recentIds[0];
      if (failed && head !== startHead) {
        // Now the device does know something the account does not.
        failed = false;
        void storage.setItem(SYNCED_KEY, '');
      }
      if (!synced || !head || head === sent) return;
      sent = head;
      void Promise.resolve(
        client.from('recent_plays').upsert({
          user_id: userId,
          rendition_id: head,
          played_at: new Date().toISOString(),
        })
      )
        .then(({ error }) => {
          if (error) throw toError(error);
        })
        .catch(() => storage.setItem(SYNCED_KEY, ''));
    });

    return () => {
      live = false;
      unsubscribe();
    };
  }, [client, userId, store, storage]);
}
