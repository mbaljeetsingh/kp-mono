/**
 * Room at the foot of a tab's list for Android's floating mini player.
 *
 * On iOS the player rides in the tab bar's own accessory slot, and the system
 * insets scroll views past it. On Android it is a card drawn over the bottom
 * of the screen ((tabs)/_layout.tsx), so a list's last rows would sit under it
 * with no way to scroll them clear. Every page under the tabs needs this.
 *
 * Returned as a style for `contentContainerStyle`, and undefined where no room
 * is needed, so the list's own `pb-*` class still applies there.
 */
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** The card (art 40 + padding, and its progress line) plus the gaps around it. */
const MINI_PLAYER_SPACE = 96;

export function useMiniPlayerSpace(): { paddingBottom: number } | undefined {
  return Platform.OS === 'android' ? { paddingBottom: MINI_PLAYER_SPACE } : undefined;
}

/**
 * How far above a tab screen's foot something must sit to clear the play controls.
 * On iOS the safe area already counts the tab bar and the accessory above it. On
 * Android the card floats over the foot, and this is the card and its gap
 * ((tabs)/_layout.tsx).
 */
export function usePlayControlsClearance(): number {
  const { bottom } = useSafeAreaInsets();
  return Platform.OS === 'ios' ? bottom : 64;
}
