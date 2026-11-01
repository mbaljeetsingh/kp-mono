/**
 * One stack per tab, each holding every page a tab can open.
 *
 * The array group gives each tab its own copy of these routes, so a ragi opened
 * from Search stays in Search with the tab bar and the play controls still under
 * it; they vanished when these pages were pushed over the tabs. The anchors put
 * each tab's own page at the bottom of its stack.
 */
import { Stack } from 'expo-router';

import { useColors } from '~/lib/theme';

export const unstable_settings = {
  home: { anchor: 'index' },
  search: { anchor: 'search' },
  radio: { anchor: 'radio' },
  saved: { anchor: 'saved' },
};

export default function TabStackLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
