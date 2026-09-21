/**
 * Device storage, in one place.
 *
 * MMKV rather than AsyncStorage. The player writes on every track change and
 * again whenever a resume position is worth keeping — which, during playback,
 * is every few seconds — and AsyncStorage sends each of those across the bridge
 * as serialised JSON. MMKV is synchronous and in-process, so a write is a
 * function call.
 *
 * The seam stays async because that is what @kp/playback and @kp/api ask for —
 * a web build fulfils it with localStorage — and resolving an
 * already-computed value costs nothing.
 */
import { createMMKV } from 'react-native-mmkv';

// v4 is a factory over nitro-modules; `new MMKV()` was the v3 API.
const mmkv = createMMKV({ id: 'kp' });

export interface DeviceStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/** Everything that was in AsyncStorage before this module existed. */
const CARRIED_OVER = ['kp:queue', 'kp:repeat', 'kp:resume', 'kp:favorites'];

const MIGRATED_KEY = 'kp:migrated-to-mmkv';

/**
 * Carry anything AsyncStorage already holds across, once.
 *
 * Without this every listener loses their queue, their saved shabads and every
 * resume position the first time they open a build with MMKV in it — which
 * would look exactly like the data loss the favourites fix was meant to end.
 *
 * Started here rather than by a caller, and awaited by every read and write
 * below, because the ordering is the whole difficulty. The migration has to
 * await a dynamic import and a bridge round trip, while a read is a synchronous
 * MMKV lookup — so a reader that does not wait sees an empty store, and a
 * *writer* that does not wait is worse: it puts a value under the key, and the
 * "never overwrite something newer" guard then skips the real data forever.
 * Saving one shabad on first launch would have cost a listener all the others.
 */
const ready: Promise<void> = (async () => {
  if (mmkv.getBoolean(MIGRATED_KEY)) return;
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const pairs = await AsyncStorage.multiGet(CARRIED_OVER);
    for (const [key, value] of pairs) {
      // Only what AsyncStorage actually held, and never over a value MMKV has
      // already been given — a rerun must not undo newer writes.
      if (value != null && mmkv.getString(key) == null) mmkv.set(key, value);
    }
    mmkv.set(MIGRATED_KEY, true);
  } catch {
    // A failed migration must not be marked done: leaving the flag unset means
    // the next launch tries again rather than silently starting empty.
  }
})();

export const storage: DeviceStorage = {
  async getItem(key) {
    try {
      await ready;
      return mmkv.getString(key) ?? null;
    } catch {
      return null;
    }
  },
  async setItem(key, value) {
    try {
      await ready;
      mmkv.set(key, value);
    } catch {
      /* a device with storage trouble still gets a working player */
    }
  },
};
