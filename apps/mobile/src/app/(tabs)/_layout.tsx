/**
 * The tabs.
 *
 * The bar itself is ours — see components/TabBar for why it cannot be the
 * default one, a sibling of <Tabs>, or the BottomTabBar from expo-router's
 * internals.
 */
import { colors } from '@kp/tokens/colors';
import { Tabs } from 'expo-router';
import { Disc3, Heart, ListMusic, Radio, Search, Users } from 'lucide-react-native';

import { TabBar } from '~/components/TabBar';

export default function TabLayout() {
  return (
    <Tabs
      // Cast because expo-router's bundled bottom-tabs types and the ones
      // TabBar names structurally are nominally different — see TabBar.
      tabBar={(props) => <TabBar {...(props as unknown as Parameters<typeof TabBar>[0])} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
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
      <Tabs.Screen
        name="playlists"
        options={{
          title: 'Lists',
          tabBarIcon: ({ color, size }) => <ListMusic color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
