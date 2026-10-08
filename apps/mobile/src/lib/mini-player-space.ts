/**
 * Room at the foot of a tab's list for Android's floating mini player.
 *
 * On iOS the player rides in the tab bar's own accessory slot, and the system
 * insets scroll views past it. On Android it is a card drawn over the bottom
 * of the screen ((tabs)/_layout.tsx), so a list's last rows would sit under it
 * with no way to scroll them clear. Only the tab screens need this: the
 * screens pushed over the tabs do not show the mini player.
 *
 * Returned as a style for `contentContainerStyle`, and undefined where no room
 * is needed, so the list's own `pb-*` class still applies there.
 */
import { Platform } from 'react-native';

import { usePlayer } from '~/lib/player';

/** The card (art 40 + padding, and its progress line) plus the gaps around it. */
const MINI_PLAYER_SPACE = 96;

export function useMiniPlayerSpace(): { paddingBottom: number } | undefined {
  const playing = usePlayer((state) => state.current !== null);
  return Platform.OS === 'android' && playing ? { paddingBottom: MINI_PLAYER_SPACE } : undefined;
}
