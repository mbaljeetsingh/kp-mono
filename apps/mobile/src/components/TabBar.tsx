/**
 * The tab bar, drawn here rather than imported.
 *
 * Two constraints meet in this file. The transport has to sit above the tabs
 * and outside every screen, or it unmounts on each tab change and playback
 * stops. And it cannot be a sibling of <Tabs>: react-native-screens renders
 * the navigator into native views that paint over anything JS puts beside them,
 * so an absolutely positioned bar is simply invisible.
 *
 * That leaves replacing the tab bar — and importing BottomTabBar from
 * `expo-router/build/react-navigation/bottom-tabs` pulls a second React into
 * the bundle, which kills every screen with "Invalid hook call". So the bar is
 * drawn from the props React Navigation already passes, which needs no import
 * at all.
 */
import { colors } from '@kp/tokens/colors';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniPlayer } from '~/components/MiniPlayer';

/**
 * Typed structurally rather than imported.
 *
 * expo-router bundles its own copy of bottom-tabs and the standalone package
 * ships another; their BottomTabBarProps are nominally different types, so
 * importing either one puts a wall of "not assignable" between this file and
 * whichever <Tabs> is actually calling it. Naming only the four things this
 * bar reads sidesteps that entirely.
 */
interface TabBarProps {
  state: { index: number; routes: { key: string; name: string; params?: object }[] };
  descriptors: Record<
    string,
    {
      options: {
        title?: string;
        tabBarAccessibilityLabel?: string;
        tabBarIcon?: (p: { focused: boolean; color: string; size: number }) => ReactNode;
      };
    }
  >;
  navigation: {
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: string, params?: object) => void;
  };
}

export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="border-t border-border bg-card">
      <MiniPlayer />

      <View className="flex-row" style={{ paddingBottom: insets.bottom }}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]!;
          const focused = state.index === index;
          const color = focused ? colors.primary : colors.mutedForeground;
          const label = typeof options.title === 'string' ? options.title : route.name;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                // The same guard the default bar has: a screen can refuse a tab
                // press, and re-pressing the active tab should not push a
                // duplicate entry.
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params);
                }
              }}
              className="flex-1 items-center gap-0.5 py-2 active:opacity-70"
            >
              {options.tabBarIcon?.({ focused, color, size: 22 })}
              <Text style={{ color }} className="text-[10px]">
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
