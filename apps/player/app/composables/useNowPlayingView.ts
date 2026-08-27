/**
 * Whether the desktop full player is showing.
 *
 * Module-level, like `usePlayer` and `useTheme`: the transport toggles it and
 * the app shell renders it, and they are not in a parent/child relationship
 * worth threading a prop through.
 */
import { ref } from 'vue';

const open = ref(false);

export function useNowPlayingView() {
  return { open };
}
