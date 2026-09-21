/** Storage that forgets. For tests, and for a surface with nothing to persist to. */
import type { PlayerStorage } from './driver';

export function memoryStorage(seed: Record<string, string> = {}): PlayerStorage {
  const map = new Map(Object.entries(seed));
  return {
    async getItem(key) {
      return map.get(key) ?? null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
  };
}
