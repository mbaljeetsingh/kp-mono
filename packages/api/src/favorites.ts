/**
 * Favorites — device-local when signed out, account-backed when signed in.
 *
 * `has` stays synchronous and `toggle` stays fire-and-forget because both are
 * called straight from row components, where an awaited toggle means a heart
 * that lags the tap that pressed it.
 *
 * Ids are rendition ids in both modes, which is what lets a guest's list
 * migrate into an account as a straight insert on first sign-in.
 */
import { chunk } from '@kp/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { KpClient } from './client';
import { keys } from './keys';

const LOCAL_KEY = 'kp:favorites';

/**
 * Where a signed-out listener's list is kept.
 *
 * Injected rather than assumed, the same way the player store takes its
 * storage: React Native has no `localStorage`, and reaching for the global
 * there threw on every read and write. Wrapped in try/catch it threw silently,
 * so saves lived in React state and died with the app — while the Saved screen
 * said they were kept on the device.
 *
 * Async because AsyncStorage is. Nothing here is awaited on a render path: the
 * first read lands in an effect and writes are fire-and-forget, so `has` stays
 * synchronous and a heart never lags the tap that pressed it.
 */
export interface FavoritesStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/** The browser's, for the two web apps. Private mode throws rather than returning null. */
export const webFavoritesStorage: FavoritesStorage = {
  async getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* a listener who blocked storage still gets a working player */
    }
  },
};

async function readLocal(storage: FavoritesStorage): Promise<string[]> {
  try {
    const raw = await storage.getItem(LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(storage: FavoritesStorage, ids: string[]) {
  void storage.setItem(LOCAL_KEY, JSON.stringify(ids));
}

/**
 * Move a guest's device-local list into their account, once.
 *
 * The ids are filtered through `shabads` first because a single id whose
 * rendition has since been deleted or unpublished would fail the whole insert
 * on its foreign key, taking the rest of the list down with it.
 *
 * localStorage is the only copy of this list, so it is cleared only once the
 * whole move has demonstrably landed — every lookup batch answered, and the
 * insert accepted. Anything less and a failure here deletes a guest's years of
 * saves instead of retrying on the next sign-in.
 */
export async function migrateLocalFavorites(
  client: KpClient,
  userId: string,
  storage: FavoritesStorage = webFavoritesStorage
): Promise<void> {
  const local = await readLocal(storage);
  if (!local.length) return;

  // Batched: this filter is a query string, and a long-standing guest's list is
  // long enough to break the request outright.
  const lookups = await Promise.all(
    chunk(local).map((batch) => client.from('shabads').select('id').in('id', batch))
  );
  if (lookups.some((r) => r.error)) return;

  const live = lookups.flatMap((r) => (r.data ?? []) as { id: string }[]).map((r) => r.id);

  if (live.length) {
    const { error } = await client.from('favorites').upsert(
      live.map((id) => ({ user_id: userId, rendition_id: id })),
      { onConflict: 'user_id,rendition_id', ignoreDuplicates: true }
    );
    if (error) return;
  }

  writeLocal(storage, []);
}

export interface Favorites {
  ids: string[];
  has: (id: string) => boolean;
  toggle: (id: string) => void;
}

export function useFavorites(
  client: KpClient,
  userId: string | null,
  storage: FavoritesStorage = webFavoritesStorage
): Favorites {
  const queryClient = useQueryClient();
  const [localIds, setLocalIds] = useState<string[]>([]);

  // Read after mount, not during render: storage is per-device and reading it
  // while rendering makes the first paint depend on it.
  useEffect(() => {
    let live = true;
    void readLocal(storage).then((ids) => {
      if (live) setLocalIds(ids);
    });
    return () => {
      live = false;
    };
  }, [storage]);

  const remote = useQuery({
    queryKey: keys.favorites.all,
    queryFn: async () => {
      const { data, error } = await client
        .from('favorites')
        .select('rendition_id,created_at')
        .order('created_at', { ascending: false });
      // Throwing keeps whatever is on screen. Returning [] would turn one
      // dropped request into "Nothing saved yet" over an account with hundreds
      // of favorites, and un-fill every heart in the list.
      if (error) throw error;
      return ((data ?? []) as { rendition_id: string }[]).map((r) => r.rendition_id);
    },
    enabled: Boolean(userId),
    staleTime: 1000 * 60,
  });

  // Migrate once per sign-in, then re-read.
  const migrated = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || migrated.current === userId) return;
    migrated.current = userId;
    void migrateLocalFavorites(client, userId, storage)
      .then(async () => {
        setLocalIds(await readLocal(storage));
        return queryClient.invalidateQueries({ queryKey: keys.favorites.all });
      })
      .catch(() => {
        // A rejected request must not leave migration marked done — clearing
        // the marker lets the next sign-in try again.
        migrated.current = null;
      });
  }, [client, userId, queryClient, storage]);

  const ids = useMemo(
    () => (userId ? (remote.data ?? []) : localIds),
    [userId, remote.data, localIds]
  );

  const has = useCallback((id: string) => ids.includes(id), [ids]);

  /**
   * In-flight write per rendition id, so two toggles of the same heart run in
   * order. Without this a double tap fires an insert and a delete concurrently
   * and the server keeps whichever finishes last — leaving the row saved while
   * the UI shows it unsaved, or the reverse.
   */
  const writes = useRef(new Map<string, Promise<unknown>>());

  const toggle = useCallback(
    (id: string) => {
      if (!userId) {
        setLocalIds((current) => {
          const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
          writeLocal(storage, next);
          return next;
        });
        return;
      }

      const adding = !ids.includes(id);

      queryClient.setQueryData<string[]>(keys.favorites.all, (current = []) =>
        adding ? [id, ...current] : current.filter((x) => x !== id)
      );

      const settle = () => void queryClient.invalidateQueries({ queryKey: keys.favorites.all });

      // Queued behind any write still in flight for this same id, so a double
      // tap ends in the state the last tap asked for rather than a coin flip.
      const write = (writes.current.get(id) ?? Promise.resolve())
        .then(() =>
          adding
            ? client.from('favorites').insert({ user_id: userId, rendition_id: id })
            : client.from('favorites').delete().eq('user_id', userId).eq('rendition_id', id)
        )
        .then(({ error }) => {
          // The optimistic list is a guess once the write fails; take the
          // server's answer rather than leaving a heart filled for something
          // that was never saved.
          if (error) settle();
        })
        .catch(settle)
        .finally(() => {
          if (writes.current.get(id) === write) writes.current.delete(id);
        });

      writes.current.set(id, write);
    },
    [client, ids, queryClient, storage, userId]
  );

  // Memoised: both apps hold this in a context value, and a fresh object every
  // render defeats the useMemo around it — re-rendering every consumer of the
  // session for a list that did not change.
  return useMemo(() => ({ ids, has, toggle }), [ids, has, toggle]);
}
