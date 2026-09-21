/**
 * What happens at the end — nothing, the queue again, or this shabad again.
 *
 * Three states rather than two, cycled off → all → one, because the two are
 * different needs and only one of them was served: `one` is sitting with a
 * shabad, `all` is putting a list on and letting it run. Without `all` a queue
 * simply stopped dead at its last item.
 *
 * `all` is the one state that changes what the *skip* buttons mean: at the end
 * of the queue Next wraps to the top and Previous off the front wraps to the
 * bottom. `one` does not touch them — pressing skip is the listener saying
 * "move on", and a repeat setting must not answer back. Only the automatic
 * end-of-item advance is affected by it.
 */
export type RepeatMode = 'off' | 'all' | 'one';

/** In cycle order, so a control can advance without a switch statement. */
export const REPEAT_MODES: RepeatMode[] = ['off', 'all', 'one'];

/**
 * How the one repeat control reads in each state.
 *
 * Shared because every surface draws the same button, and three states typed
 * out per app is three states that drift. The name states what is *on* rather
 * than what a press would do: a cycle of three has no single "would do", and a
 * tri-state control announced as a two-state toggle tells a screen reader
 * something false.
 */
export const REPEAT_LABELS: Record<RepeatMode, string> = {
  off: 'Repeat off',
  all: 'Repeat all',
  one: 'Repeat this shabad',
};

export const REPEAT_HINTS: Record<RepeatMode, string> = {
  off: 'Not repeating — the queue plays to its end and stops',
  all: 'Repeating the queue — it starts again at its end',
  one: 'Repeating this shabad',
};

export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  return REPEAT_MODES[(REPEAT_MODES.indexOf(mode) + 1) % REPEAT_MODES.length]!;
}

/**
 * Parse a persisted value. `'1'` is what the two-state version wrote, and it
 * meant repeat-one — read rather than migrated, since the next press writes
 * the new vocabulary anyway and a listener who left repeat on should not find
 * it off.
 */
export function parseRepeatMode(saved: string | null): RepeatMode {
  if (saved === '1') return 'one';
  return REPEAT_MODES.includes(saved as RepeatMode) ? (saved as RepeatMode) : 'off';
}
