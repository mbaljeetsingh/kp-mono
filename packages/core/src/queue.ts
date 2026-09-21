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
