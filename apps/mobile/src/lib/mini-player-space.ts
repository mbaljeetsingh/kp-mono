/**
 * Where the mini player lives, and the room a tab's list leaves for it.
 *
 * On iOS 26 the player rides in the tab bar's own accessory slot, and the
 * system insets scroll views past it. That slot does not exist before iOS 26 —
 * a TestFlight tester on iOS 18 had no transport anywhere on screen — nor on
 * Android. There it is a card drawn over the bottom of the screen
 * (`FloatingMiniPlayer`), so a list's last rows would sit under it with no way
 * to scroll them clear. Every page under the tabs needs this.
 *
 * Returned as a style for `contentContainerStyle`, and undefined where no room
 * is needed, so the list's own `pb-*` class still applies there.
 */
import { Platform } from 'react-native';

/** iOS 26 and later: the tab bar has a bottom accessory to hold the player. */
export const HAS_TAB_ACCESSORY =
  Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) >= 26;

/** Everywhere else the player is a floating card instead. */
export const MINI_PLAYER_FLOATS = !HAS_TAB_ACCESSORY;

/** The card (art 40 + padding, and its progress line) plus the gaps around it. */
const MINI_PLAYER_SPACE = 96;

export function useMiniPlayerSpace(): { paddingBottom: number } | undefined {
  return MINI_PLAYER_FLOATS ? { paddingBottom: MINI_PLAYER_SPACE } : undefined;
}
