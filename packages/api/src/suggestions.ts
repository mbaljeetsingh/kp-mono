/**
 * What to put in Up next when nobody has queued anything.
 *
 * The queue is empty almost all of the time — adding to it is a deliberate act
 * and most listening is one shabad at a time — so the panel that exists to show
 * it spent its life saying "Nothing queued". These are suggestions for that
 * space, and deliberately only suggestions: nothing here is queued and nothing
 * plays on its own. A shabad is often put on for its own sake, and continuing
 * into something else unasked is a decision that belongs to the listener.
 *
 * Ordered by how related the suggestion is: the same ragi first, then the same
 * raag, then whatever is newest. Each group only offers what the ones above it
 * did not already name.
 */
import { toPlayable, type Playable } from '@kp/core';

import type { KpClient } from './client';
import { parseRows, shabadRowSchema } from './schemas';

/** Per group. Enough to be worth a heading, few enough to stay a shelf. */
const PER_GROUP = 4;

export interface SuggestionGroup {
  label: string;
  items: Playable[];
}

export async function fetchSuggestionGroups(
  client: KpClient,
  current: Playable | null
): Promise<SuggestionGroup[]> {
  /*
   * A station's id is not a rendition uuid — it is `station:<slug>` — so there
   * is nothing in this table for it to exclude. Passing it anyway put a
   * non-uuid in the `not in` list, Postgres rejected the whole query, and every
   * group came back empty: Up next on a live broadcast said there was nothing
   * published to suggest while the archive was full of it.
   */
  const seen = new Set<string>(current && !current.isLive ? [current.id] : []);
  const groups: SuggestionGroup[] = [];

  /** One query, minus anything an earlier group already offered. */
  async function take(
    label: string,
    build: (q: ReturnType<KpClient['from']>) => unknown
  ): Promise<void> {
    let q = client.from('shabads').select('*') as never;
    q = build(q) as never;
    // PostgREST wants the in-list parenthesised; ids are uuids, so there is
    // nothing here to quote or escape.
    if (seen.size) {
      q = (q as { not: Function }).not('id', 'in', `(${[...seen].join(',')})`) as never;
    }
    const { data, error } = (await (q as { limit: Function }).limit(PER_GROUP)) as {
      data: unknown[] | null;
      error: unknown;
    };
    // Thrown, not swallowed. A silent `return` here made a failed query
    // indistinguishable from an empty archive, which is exactly how a station
    // id in a uuid filter went unnoticed: Up next said there was nothing
    // published to suggest while every request was coming back 400.
    if (error) throw error;

    const { rows } = parseRows(shabadRowSchema, data ?? []);
    if (!rows.length) return;
    rows.forEach((r) => seen.add(r.id));
    groups.push({ label, items: rows.map(toPlayable) });
  }

  // A broadcast relates to nothing in the archive, so it skips straight to the
  // fallback rather than searching for renditions by a station's name.
  if (current?.artist && !current.isLive) {
    await take(`More from ${current.subtitle ?? current.artist}`, (q) =>
      (q as never as { eq: Function })
        .eq('artist', current.artist)
        .order('created_at', { ascending: false })
    );
  }

  if (current?.raag && !current.isLive) {
    await take(`More in ${current.raag}`, (q) =>
      (q as never as { eq: Function })
        .eq('raag', current.raag)
        .order('created_at', { ascending: false })
    );
  }

  // Always something, even for a shabad whose ragi and raag have nothing else
  // published under them yet — which, this early in the archive, is most of them.
  if (!groups.length) {
    await take('Recently added', (q) =>
      (q as never as { order: Function }).order('created_at', {
        ascending: false,
      })
    );
  }

  return groups;
}
