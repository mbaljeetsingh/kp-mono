/**
 * One stack per tab, each holding every page a tab can open.
 *
 * The array group gives each tab its own copy of these routes, so a ragi opened
 * from Search stays in Search with the tab bar and the play controls still under
 * it; they vanished when these pages were pushed over the tabs. The anchors put
 * each tab's own page at the bottom of its stack.
 */
import { Stack } from 'expo-router';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloatingMiniPlayer } from '~/components/MiniPlayer';
import { HAS_TAB_ACCESSORY } from '~/lib/mini-player-space';
import { useColors } from '~/lib/theme';

export const unstable_settings = {
  home: { anchor: 'index' },
  search: { anchor: 'search' },
  radio: { anchor: 'radio' },
  saved: { anchor: 'saved' },
};

export default function TabStackLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const stack = (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
  if (Platform.OS !== 'ios' || HAS_TAB_ACCESSORY) return stack;

  /*
   * Before iOS 26 the tab bar has no accessory slot, and the player went
   * missing altogether — playback with no transport on screen. It cannot go
   * beside NativeTabs (the native tabs paint over it, see (tabs)/_layout), so
   * each tab's stack floats its own over its pages. One per tab is harmless:
   * the player is the store, this is only its controls, and a modal such as
   * the full player still covers it.
   *
   * This view already stops at the top of the tab bar, and inside it the bar
   * has taken the home-indicator inset (it reads 0), so 8 is all the lift the
   * card needs. Adding the bar's 49pt again floated it a bar's height too high.
   * The inset stays for iPad, where the bar is at the top and the view runs to
   * the foot of the window.
   */
  return (
    <View style={{ flex: 1 }}>
      {stack}
      <FloatingMiniPlayer bottom={insets.bottom + 8} />
    </View>
  );
}
