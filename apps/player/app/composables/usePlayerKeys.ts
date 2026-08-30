/**
 * Keyboard control for the transport.
 *
 * The player survives navigation, so the keys belong to the app rather than to
 * any page: whatever you are browsing, space still pauses what is playing. The
 * mapping is the one every music player has trained — space to pause, arrows to
 * move inside the shabad, shift+arrows to change shabad — so there is nothing
 * to learn, which is the only reason to add shortcuts to a listening app.
 */
import { onMounted, onUnmounted } from 'vue';
import { usePlayer } from './usePlayer';
import { skipToNext } from './useQueueSuggestions';

/** Ten seconds is the step every player uses for an arrow press. */
const SEEK_STEP = 10;

export function usePlayerKeys() {
  const player = usePlayer();

  /**
   * A shabad is a window over a much longer file, so seeking is clamped to the
   * window. Without this, one arrow press past the end runs into the next
   * shabad of a 70-minute set, and one before the start plays the end of the
   * previous one — both of which sound like the app losing its place.
   */
  function nudge(delta: number) {
    const c = player.current.value;
    if (!c) return;
    const start = c.startSec ?? 0;
    const end = c.endSec ?? player.duration.value;
    // Step from where playback actually is, and from inside the shabad. The
    // element is the authority: its mirror lags by up to a timeupdate, so two
    // quick presses would otherwise share a base and the second would be lost.
    // Clamping into the window matters before the first play, when the mirror
    // still reads 0 while the element already sits at a startSec of 109.
    const live = player.position();
    const from = Math.max(
      start,
      Number.isFinite(end) && end > start ? Math.min(live, end) : live
    );
    let to = from + delta;
    to = Math.max(start, to);
    // Landing exactly on the end would trip the advance-to-next check in
    // onTimeUpdate, so a forward nudge stops just short of it.
    if (Number.isFinite(end) && end > start) to = Math.min(to, end - 0.5);
    player.seek(to);
  }

  function onKey(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    // Typing wins: the search field is a text input, and so is a playlist name.
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    )
      return;
    // Widgets that own these keys — menus, selects and the auth dialog all
    // answer to arrows and space themselves.
    //
    // Guarded on `closest` existing: with nothing focused the target is the
    // document, not an element, and calling it there threw — which killed the
    // handler before it reached the switch and made every shortcut a no-op in
    // exactly the state they are most used from.
    //
    // A focused button owns its own keys too: space is how a button is pressed,
    // so hijacking it meant tabbing to Open the full player, or repeat, or a
    // row in the queue and pressing space paused playback instead of doing the
    // thing that had focus. ShabadRow stops the event by hand for exactly this
    // reason; every other button now gets it for free.
    if (
      typeof target.closest === 'function' &&
      target.closest(
        'button,[role="button"],[role="combobox"],[role="listbox"],[role="menu"],[role="dialog"],[role="alertdialog"]'
      )
    )
      return;
    // Cmd+← is Back and Ctrl+arrow belongs to the window manager. Shift is the
    // only modifier this claims.
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // Nothing loaded means nothing to control, and swallowing space then would
    // cost the page its scrolling for no reason.
    if (!player.current.value) return;

    switch (event.key) {
      case ' ':
      case 'k':
        event.preventDefault();
        player.toggle();
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (event.shiftKey) void skipToNext();
        // A broadcast has no position to move within — only the queue keys mean
        // anything while it is on air, and the skip knows to stop there rather
        // than start whatever the listener had lined up.
        else if (!player.isLive.value) nudge(SEEK_STEP);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (event.shiftKey) void player.previous();
        else if (!player.isLive.value) nudge(-SEEK_STEP);
        break;
      case 'n':
        event.preventDefault();
        void skipToNext();
        break;
      case 'p':
        event.preventDefault();
        void player.previous();
        break;
      case 'r':
        // Live has no end to repeat; leave the key inert there rather than
        // cycling a setting the transport is not showing.
        if (player.isLive.value) break;
        event.preventDefault();
        player.cycleRepeat();
        break;
    }
  }

  onMounted(() => window.addEventListener('keydown', onKey));
  onUnmounted(() => window.removeEventListener('keydown', onKey));
}
