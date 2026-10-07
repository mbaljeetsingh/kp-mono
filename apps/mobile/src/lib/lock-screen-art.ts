/**
 * Where each shabad's lock-screen artwork lives, once LockScreenArtwork has
 * drawn it (see that component for why it is drawn at all).
 *
 * Its own module because the store asks for an item's artwork synchronously,
 * from player.ts, and the component that writes the files imports player.ts.
 */
import type { PlayableTile } from '@kp/core';
import { File, Paths } from 'expo-file-system';

/** Written tiles, by key. */
const written = new Map<string, string>();

export function tileKey(tile: PlayableTile): string {
  return `${tile.seed}|${tile.initials}|${tile.gurmukhi ? 'g' : 'l'}`;
}

/** A stable file name for a key: Gurmukhi initials would do in a path, but hashed is tidier. */
export function tileFile(key: string): File {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  return new File(Paths.cache, `lockscreen-tile-${h.toString(36)}.png`);
}

export function rememberTile(key: string, uri: string) {
  written.set(key, uri);
}

/**
 * The artwork URL for a tile, if it has been drawn. A tile drawn after its item
 * loaded reaches the lock screen through the store's `retitle()`.
 */
export function tileArtworkUrl(tile: PlayableTile): string | undefined {
  const key = tileKey(tile);
  const known = written.get(key);
  if (known) return known;
  // Drawn in an earlier session: the cache directory still holds it.
  const file = tileFile(key);
  if (file.exists) {
    written.set(key, file.uri);
    return file.uri;
  }
  return undefined;
}
