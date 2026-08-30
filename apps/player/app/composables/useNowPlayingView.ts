/**
 * Whether the full player is showing — one flag per size.
 *
 * Module-level, like `usePlayer` and `useTheme`: the transport opens these and
 * the app shell renders them, and they are not in a parent/child relationship
 * worth threading a prop through. The phone's flag used to be a local ref in
 * PlayerBar, which put it out of reach of the two things that have to close it
 * — a route change, and the navigation that caused one.
 *
 * Two flags rather than one because the two players are two components on
 * either side of `md`, each with its own way out: the desktop overlay is closed
 * from the chevron in the bar behind it, the phone's sheet from its own handle.
 * PlayerBar watches the breakpoint and clears whichever one has just become
 * unreachable.
 */
import { ref } from 'vue';

/** The desktop overlay, over the content area beside the sidebar. */
const open = ref(false);
/** The phone's full-screen sheet. */
const sheet = ref(false);

export function useNowPlayingView() {
  /**
   * Put the player away, whichever one is up.
   *
   * Called on navigation — and on the *intent* to navigate, which is not the
   * same event: a tab or sidebar link pointing at the page already showing
   * changes no route, so a watcher never fires and the click reads as dead.
   */
  function close() {
    open.value = false;
    sheet.value = false;
  }

  return { open, sheet, close };
}
