/**
 * Links to one rendition: `/r/<id>?t=<seconds>`, the same on every surface.
 *
 * A path of its own rather than a query on Home, so a later edge function can
 * give each shabad its own preview card by matching `/r/*` alone. `t` is
 * seconds into the shabad, the clock the seek bar shows; `linkStartPosition`
 * turns it back into a position on arrival.
 */
import { elapsedIn } from './segment';
import type { Playable } from './types';

/**
 * Below this the link starts from the top. Someone a few seconds in is sharing
 * the shabad, not a moment in it, and a link that opens on 0:04 reads as a
 * mistake.
 */
export const SHARE_FROM_HERE_SEC = 10;

export function shareUrl(item: Playable, position: number, origin: string): string {
  const url = `${origin}/r/${encodeURIComponent(item.id)}`;
  // Rounded, not floored: a link cued at 1:30 reports 89.999… back from the
  // audio element, and flooring that would make every re-share a second early.
  const into = Math.round(elapsedIn(item, position));
  return into >= SHARE_FROM_HERE_SEC ? `${url}?t=${into}` : url;
}
