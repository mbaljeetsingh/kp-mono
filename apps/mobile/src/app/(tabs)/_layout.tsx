/**
 * The tabs, with the transport pinned above them.
 *
 * The mini player is rendered as part of the tab bar rather than inside a
 * screen: a screen-level bar unmounts on every tab change, which stops
 * playback, and a sibling of <Tabs> would sit underneath it.
 */
// expo-router bundles its own copy of bottom-tabs, and its types are not the
// standalone package's — mixing them is a wall of "not assignable".
import {
  BottomTabBar,
  type BottomTabBarProps,
} from 'expo-router/build/react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { Disc3, Heart, Radio, Search, Users } from 'lucide-react-native';
import { View } from 'react-native';

import { MiniPlayer } from '~/components/MiniPlayer';

function TabBar(props: BottomTabBarProps) {
  return (
    <View>
      <MiniPlayer />
      <BottomTabBar {...props} />
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={TabBar}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: '#0a0a0a' },
        tabBarStyle: { backgroundColor: '#171717', borderTopColor: '#262626' },
        tabBarActiveTintColor: '#fbbf24',
        tabBarInactiveTintColor: '#a3a3a3',
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Shabads',
          tabBarIcon: ({ color, size }) => <Disc3 color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size }) => <Search color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="ragis"
        options={{
          title: 'Ragis',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="radio"
        options={{
          title: 'Radio',
          tabBarIcon: ({ color, size }) => <Radio color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: 'Saved',
          tabBarIcon: ({ color, size }) => <Heart color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
