/**
 * What this listener played lately, for the way back in on Home. Kept on the
 * device, and in their account when they have one (@kp/api's useRecentSync).
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

/**
 * Two lists as one: everything in `first`, in order, then what only `second` has.
 * Which goes first is the caller's call on whose list is newer.
 */
export function mergeRecent(
  first: readonly string[],
  second: readonly string[]
): readonly string[] {
  return [...first, ...second.filter((id) => !first.includes(id))].slice(0, RECENT_LIMIT);
}

/**
 * What was played on top of `earlier`. Each play moves to the front, so these are
 * whatever now sits ahead of the old head, a replay of an old entry included.
 */
export function playedSince(earlier: readonly string[], now: readonly string[]): readonly string[] {
  const head = earlier[0];
  return head === undefined ? now : now.slice(0, Math.max(0, now.indexOf(head)));
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
