/**
 * Press Next when the queue has nowhere to go.
 *
 * The same rule the web player follows, and for the same reason: a single
 * shabad played from search or Saved has no follower, so Next was a dead
 * button underneath an Up next panel already showing four suggestions.
 *
 * The group is appended rather than played over the queue, so what was playing
 * stays behind the cursor and Previous still goes back to it — the difference
 * between skipping forward and starting a new list.
 */
import { fetchSuggestionGroups } from '@kp/api';
import { upNext } from '@kp/core';

import { playerActions, playerStore } from '~/lib/player';
import { supabase } from '~/lib/supabase';

/** Set while a skip is waiting on a fetch — see the guard below. */
let skipping = false;

export async function skipToNext(): Promise<void> {
  const state = playerStore.getState();
  const current = state.current;

  // Still somewhere to go, nothing to suggest past, or a broadcast — all three
  // are the player's own skip, and it already knows what each of them means.
  if (
    !current ||
    current.isLive ||
    upNext({ items: state.items, index: state.index, repeat: state.repeat }).length
  ) {
    playerActions.next();
    return;
  }

  // Repeat-all makes the end of the queue a dead end no longer: Next wraps to
  // the top, which `next()` handles. Checked here as well, because this branch
  // is reached precisely when Up next is empty — otherwise a skip off the last
  // item would append suggestions and the queue the listener asked to hear on
  // a loop would quietly grow instead.
  if (state.repeat === 'all' && state.items.length) {
    playerActions.next();
    return;
  }

  // Only this branch awaits a fetch, and the button does not disable while it
  // runs — so two quick taps on a cold cache would both read the queue as it
  // was, and the second would overwrite the first's append, swallowing a tap.
  if (skipping) return;
  skipping = true;
  try {
    const groups = await fetchSuggestionGroups(supabase, current);
    const items = groups.flatMap((g) => g.items);
    if (!items.length) {
      playerActions.next();
      return;
    }
    items.forEach((item) => playerActions.addToQueue(item));
    playerActions.next();
  } catch {
    // A failed lookup still has to move the player, or the tap does nothing.
    playerActions.next();
  } finally {
    skipping = false;
  }
}
