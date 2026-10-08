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
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniPlayer } from '~/components/MiniPlayer';
import { usePlayer } from '~/lib/player';
import { useColors } from '~/lib/theme';

/*
 * Three, as the web has on a phone (apps/player/src/routes/root.tsx).
 *
 * Search and Ragis are not places of their own: search is a button in Home's
 * header and finds ragis too, and the directory is a shelf on Home with a
 * "See all". Library is Saved and Playlists together, one switch apart.
 */
const TABS = [
  { name: 'index', label: 'Home', sf: 'house', md: 'home' },
  { name: 'radio', label: 'Radio', sf: 'dot.radiowaves.left.and.right', md: 'radio' },
  { name: 'saved', label: 'Library', sf: 'books.vertical', md: 'library_music' },
] as const;

/*
 * Android's tab bar is Material's navigation bar: 80dp, sat on the system
 * navigation inset. The mini player floats just above it (see below).
 */
const ANDROID_TAB_BAR_HEIGHT = 80;

export default function TabLayout() {
  const colors = useColors();
  // Only whether there is anything loaded, so this does not re-render at the
  // 10Hz the status updates arrive at.
  const playing = usePlayer((state) => state.current !== null);
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
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
        iconColor={{ default: colors.subtleForeground, selected: colors.primary }}
        labelStyle={{ color: colors.subtleForeground }}
      >
        {TABS.map((tab) => (
          <NativeTabs.Trigger key={tab.name} name={tab.name}>
            <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
            {/* SF Symbols are iOS-only. Without `md` Android drew the tabs with
              no icons at all — just three floating labels. */}
            <NativeTabs.Trigger.Icon sf={tab.sf} md={tab.md} />
          </NativeTabs.Trigger>
        ))}

        {/*
         * Outside every screen, so navigating never interrupts playback.
         *
         * Omitted entirely rather than rendered empty: the accessory is a pill
         * iOS draws and blurs itself, so a MiniPlayer that returns null on a
         * fresh install still left a blank capsule floating above the tabs.
         */}
        {playing && Platform.OS === 'ios' ? (
          <NativeTabs.BottomAccessory>
            <MiniPlayer />
          </NativeTabs.BottomAccessory>
        ) : null}
      </NativeTabs>

      {/*
       * Android has no bottom accessory — it is an iOS 26 slot, and on Android
       * the MiniPlayer above never rendered: playback started with no transport
       * anywhere on screen. So it floats here instead, a card just above the
       * tab bar. A sibling after the navigator draws over it on Android (the
       * painting-over problem the file's header describes is an iOS one), and
       * it is still outside every screen, so navigating never stops playback.
       */}
      {playing && Platform.OS === 'android' ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 8,
            right: 8,
            bottom: insets.bottom + ANDROID_TAB_BAR_HEIGHT + 8,
          }}
        >
          <View className="overflow-hidden rounded-2xl border border-border bg-card">
            <MiniPlayer />
          </View>
        </View>
      ) : null}
    </View>
  );
}
