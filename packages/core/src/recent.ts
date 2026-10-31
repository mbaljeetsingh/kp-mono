/**
 * What this device played lately, for the way back in on Home.
 *
 * Ids rather than whole items: a stored copy never refreshes, so it would pin
 * old timings and go on offering a rendition that has since been unpublished.
 * The shelf asks for the rows fresh, and anything gone simply drops out.
 *
 * This is not `kp:resume`, which skips every segment on purpose: a published
 * shabad restarts from its own beginning, so there is no position to return to.
 */
import type { Playable } from './types';

export const RECENT_LIMIT = 12;

/**
 * The list with this item at the front. Only a published rendition counts: a
 * broadcast has no row to fetch back, and neither does a whole raw file.
 */
export function withRecent(ids: readonly string[], item: Playable): readonly string[] {
  if (item.isLive || item.startSec === undefined) return ids;
  return [item.id, ...ids.filter((id) => id !== item.id)].slice(0, RECENT_LIMIT);
}

/** A stored value. Anything corrupt or stale reads as nothing played. */
export function parseRecentIds(raw: string | null | undefined): readonly string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string').slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}
