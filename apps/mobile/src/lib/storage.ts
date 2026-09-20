/**
 * Device storage, in one place.
 *
 * MMKV rather than AsyncStorage. The player writes on every track change and
 * again whenever a resume position is worth keeping — which, during playback,
 * is every few seconds — and AsyncStorage sends each of those across the bridge
 * as serialised JSON. MMKV is synchronous and in-process, so a write is a
 * function call.
 *
 * The one that matters on screen is the read: `hydrate()` awaits three keys
 * before the restored queue can paint, and synchronous reads mean the mini
 * player is populated on the first frame rather than the second.
 *
 * The seam stays async because that is what @kp/playback and @kp/api ask for —
 * a web build fulfils it with localStorage, which cannot be synchronous
 * everywhere — and resolving an already-computed value costs nothing.
 */
// v4 is a factory over nitro-modules; `new MMKV()` was the v3 API.
import { createMMKV } from 'react-native-mmkv';

const mmkv = createMMKV({ id: 'kp' });

export interface DeviceStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const storage: DeviceStorage = {
  async getItem(key) {
    try {
      return mmkv.getString(key) ?? null;
    } catch {
      return null;
    }
  },
  async setItem(key, value) {
    try {
      mmkv.set(key, value);
    } catch {
      /* a device with storage trouble still gets a working player */
    }
  },
};

/**
 * Carry anything AsyncStorage already holds across, once.
 *
 * Without this every listener loses their queue, their saved shabads and every
 * resume position the first time they open a build with MMKV in it — which
 * would look exactly like the data loss the favourites fix was meant to end.
 * Runs before the store hydrates, and marks itself done so it never runs twice.
 */
const MIGRATED_KEY = 'kp:migrated-to-mmkv';

export async function migrateFromAsyncStorage(keys: string[]): Promise<void> {
  if (mmkv.getBoolean(MIGRATED_KEY)) return;
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const pairs = await AsyncStorage.multiGet(keys);
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
}
