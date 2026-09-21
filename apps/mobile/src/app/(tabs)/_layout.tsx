/**
 * The tabs, drawn by iOS.
 *
 * This used to be a hand-written bar, for a reason that was real: the transport
 * has to sit above the tabs and outside every screen or it unmounts on each tab
 * change and playback stops — and it cannot simply be a sibling of the
 * navigator, because react-native-screens renders into native views that paint
 * over anything JS puts beside them. Replacing the bar was the only way to get
 * a view into that space.
 *
 * `NativeTabs.BottomAccessory` is that space, natively. It is the slot iOS 26
 * itself puts above the tab bar, which is where Apple Music keeps its own
 * transport — so the workaround becomes the platform's own answer, and the bar
 * comes with real blur, the selection haptics and the press behaviour no
 * hand-drawn Pressable reproduces.
 *
 * Icons are SF Symbol names rather than lucide components. The bar is drawn by
 * UIKit, so it wants the system's own glyphs; lucide still draws everywhere
 * else in the app.
 */
import { colors } from '@kp/tokens/colors';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { MiniPlayer } from '~/components/MiniPlayer';
import { usePlayer } from '~/lib/player';

/*
 * Five, not six.
 *
 * iOS collapses anything past the fifth into a "More" list, and it chose which
 * two to hide — Saved and Lists, the two a signed-in listener uses most. Lists
 * loses the tab: playlists need an account, and the ones who have one reach
 * them from Saved, which is one tap from the same place.
 */
const TABS = [
  { name: 'index', label: 'Shabads', sf: 'opticaldisc' },
  { name: 'search', label: 'Search', sf: 'magnifyingglass' },
  { name: 'ragis', label: 'Ragis', sf: 'person.2' },
  { name: 'radio', label: 'Radio', sf: 'dot.radiowaves.left.and.right' },
  { name: 'saved', label: 'Saved', sf: 'heart' },
] as const;

export default function TabLayout() {
  // Only whether there is anything loaded, so this does not re-render at the
  // 10Hz the status updates arrive at.
  const playing = usePlayer((state) => state.current !== null);

  return (
    <NativeTabs
      // Without this the bar is the system blue. Everything else about it —
      // blur, haptics, the press behaviour — is UIKit's and better left alone.
      /*
       * Inert today, and kept anyway.
       *
       * It reaches UIKit — react-native-screens sets
       * `_controller.tabBarMinimizeBehavior` from it — but UIKit minimizes
       * against a scroll view it has been *told* about, via
       * `setContentScrollView`. RNS only makes that call from
       * `registerDescendantScrollView`, which is compiled in behind
       * `RNS_GAMMA_ENABLED` (an env flag at pod-install time, off by default)
       * and is driven by a `ScrollViewMarker` that the package does not export
       * from its root. So a plain FlatList is never registered and there is
       * nothing to observe.
       *
       * Enabling an experimental compile flag across the whole navigation layer
       * is not a trade worth making for a scroll animation. The prop starts
       * working the day gamma ships by default; removing it would only mean
       * rediscovering this.
       */
      minimizeBehavior="onScrollDown"
      tintColor={colors.primary}
      iconColor={{ default: colors.mutedForeground, selected: colors.primary }}
      labelStyle={{ color: colors.mutedForeground }}
    >
      {TABS.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={tab.sf} />
        </NativeTabs.Trigger>
      ))}

      {/*
       * Outside every screen, so navigating never interrupts playback.
       *
       * Omitted entirely rather than rendered empty: the accessory is a pill
       * iOS draws and blurs itself, so a MiniPlayer that returns null on a
       * fresh install still left a blank capsule floating above the tabs.
       */}
      {playing ? (
        <NativeTabs.BottomAccessory>
          <MiniPlayer />
        </NativeTabs.BottomAccessory>
      ) : null}
    </NativeTabs>
  );
}
