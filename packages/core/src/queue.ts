/**
 * What the queue does next — decided, not performed.
 *
 * These are the rules that are easy to get subtly wrong and impossible to test
 * once they are tangled with an audio element, so they live here as pure
 * functions over a snapshot. The store's job is to carry out the answer.
 */
import type { RepeatMode } from './repeat';
import type { Playable } from './types';

export interface QueueState {
  items: Playable[];
  /** Cursor. -1 means nothing has played yet — before the queue, not in it. */
  index: number;
  repeat: RepeatMode;
}

export type Advance =
  /** Load and play the item at this index. */
  | { kind: 'play'; index: number }
  /** Back to the current segment's own start. */
  | { kind: 'restart' }
  /** Park. Nothing follows. */
  | { kind: 'stop' }
  /** Leave everything alone. */
  | { kind: 'none' };

/**
 * The item finished on its own, or ran past its segment end.
 *
 * `one` is the only mode that short-circuits the advance; `all` is handled by
 * `onNext`, which is where the end of the queue is known. Live has nothing to
 * repeat — a dropped stream ends too, and restarting it here would fight the
 * reconnect.
 */
export function onEnded(state: QueueState, isLive: boolean): Advance {
  if (state.repeat === 'one' && !isLive) return { kind: 'restart' };
  return onNext(state, isLive);
}

/**
 * Next, whether pressed or reached.
 *
 * Stopping at the end is the *default* case, not an edge one: a single shabad
 * played from search or favorites has no follower, and returning silently
 * would leave the file running past the segment into the rest of a 70-minute
 * recording.
 */
export function onNext(state: QueueState, isLive: boolean): Advance {
  // A dropped live connection ends too. Since switching to a broadcast keeps
  // the listener's queue, without this a hiccup would start playing whatever
  // they had lined up, unprompted.
  if (isLive) return { kind: 'stop' };

  const last = state.items.length - 1;
  if (state.index >= last) {
    // Repeat-all says the end of the queue is the start of it. A one-item
    // queue wraps onto itself, which is repeat-one by another name and exactly
    // what "repeat all" should do with a list of one.
    if (state.repeat === 'all' && state.items.length) return { kind: 'play', index: 0 };
    return { kind: 'stop' };
  }
  return { kind: 'play', index: state.index + 1 };
}

/** How far into the current item counts as "not at the start". */
const RESTART_WINDOW_SEC = 3;

/**
 * Previous restarts the current item first, the way every music player does,
 * and only steps back if pressed again near the start.
 *
 * `elapsedInSegment` rather than raw position: a segment beginning twelve
 * minutes into a set would otherwise always read as past the window, making
 * the step-back branch unreachable.
 */
export function onPrevious(state: QueueState, elapsedInSegment: number): Advance {
  if (elapsedInSegment > RESTART_WINDOW_SEC) return { kind: 'restart' };

  if (state.index <= 0) {
    // The other half of the wrap: stepping back off the front of a repeating
    // queue lands on its last item. Asymmetry here would read as a bug.
    if (state.repeat === 'all' && state.items.length) {
      return { kind: 'play', index: state.items.length - 1 };
    }
    return { kind: 'none' };
  }
  return { kind: 'play', index: state.index - 1 };
}

/** What plays after the cursor. With the cursor before the queue, all of it. */
export function upNext(state: QueueState): Playable[] {
  return state.items.slice(state.index + 1);
}

/**
 * What follows the cursor in a random order. What is behind it stays there, so
 * Previous still goes back to what was just heard.
 */
export function shuffledQueue(
  items: Playable[],
  index: number,
  random: () => number = Math.random
): Playable[] {
  const rest = upNext({ items, index, repeat: 'off' });
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  return [...items.slice(0, index + 1), ...rest];
}

/**
 * Back to the order the list had before shuffling, with the cursor still on what
 * is playing. Anything added since is not in `order`, so it stays at the end, in
 * the order it was added; anything removed since simply does not come back. The
 * cursor follows its position rather than its item: a recording queued twice is
 * the same object both times, and looking it up would land on the earlier copy.
 */
export function unshuffledQueue(
  items: Playable[],
  index: number,
  order: readonly string[]
): { items: Playable[]; index: number } {
  const ranks = new Map<string, number>();
  order.forEach((id, at) => {
    if (!ranks.has(id)) ranks.set(id, at);
  });
  const restored = items
    .map((item, at) => ({ item, at, rank: ranks.get(item.id) ?? order.length }))
    .sort((a, b) => a.rank - b.rank);
  const cursor = restored.findIndex(({ at }) => at === index);
  return { items: restored.map(({ item }) => item), index: cursor < 0 ? index : cursor };
}

/** Shuffling needs at least two items still to come, or it changes nothing. */
export function canShuffle(state: Pick<QueueState, 'items' | 'index'>): boolean {
  return state.items.length - state.index - 1 > 1;
}

/**
 * How many random shabads shuffle fetches: enough to listen through without
 * thinking about it again, few enough that the queue stays readable.
 */
export const SHUFFLE_SIZE = 30;

/**
 * What shuffle does when pressed. With too little left to reorder it fetches
 * random shabads instead: pressing it there means "keep the kirtan going", and
 * a greyed-out button gave someone playing a single shabad nothing to do. With
 * nothing loaded it fetches them and plays the first.
 */
export function shuffleAction(
  state: Pick<QueueState, 'items' | 'index'> & {
    current: Playable | null;
    shuffleOrder: readonly string[] | null;
  }
): 'none' | 'start' | 'toggle' | 'fetch' {
  if (!state.current) return 'start';
  if (state.current.isLive) return 'none';
  return state.shuffleOrder || canShuffle(state) ? 'toggle' : 'fetch';
}

/** The fetched rows the queue does not already hold, in their order. */
export function newToQueue(items: readonly Playable[], rows: readonly Playable[]): Playable[] {
  const held = new Set(items.map((item) => item.id));
  return rows.filter((row) => !held.has(row.id));
}
