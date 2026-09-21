/**
 * Keyboard shortcuts.
 *
 * Space is the one people reach for, and it has to be taken carefully: it is
 * also how a focused button is pressed, so typing in a field or operating a
 * control must not toggle playback.
 */
import { useEffect } from 'react';

import { playerActions, playerStore } from '~/lib/player';
import { skipToNext } from '~/lib/skip';

/** Seconds per arrow press. The same nudge the scrubber makes. */
const NUDGE = 5;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function usePlayerKeys() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;

      const state = playerStore.getState();
      if (!state.current) return;

      switch (event.key) {
        case ' ':
          // Space on a focused button is that button's press, not ours.
          if (event.target instanceof HTMLElement && event.target.closest('button,a')) return;
          event.preventDefault();
          playerActions.toggle();
          return;
        case 'ArrowRight':
          // A broadcast has no timeline to move along.
          if (state.current.isLive) return;
          event.preventDefault();
          playerActions.seek(state.position + NUDGE);
          return;
        case 'ArrowLeft':
          if (state.current.isLive) return;
          event.preventDefault();
          playerActions.seek(state.position - NUDGE);
          return;
        case 'j':
          playerActions.previous();
          return;
        case 'l':
          void skipToNext();
          return;
        case 'r':
          playerActions.cycleRepeat();
          return;
        default:
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
