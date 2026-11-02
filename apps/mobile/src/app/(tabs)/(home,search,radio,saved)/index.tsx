/**
 * Home: shelves, as on the web (apps/player/src/routes/index.tsx).
 *
 * Everything here comes from published shabads, never raw files — a 70-minute
 * set is not listenable until somebody has marked where each shabad begins.
 * Shelves rather than one endless list: short enough that the next one is
 * still in reach, with the whole archive a "See all" away.
 */
import { DEFAULT_STATION, stationPlayable } from '@kp/core';
import { Play, Radio } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { AppHeader } from '~/components/AppHeader';
import { OfflineNotice } from '~/components/OfflineNotice';
import { Screen } from '~/components/Screen';
import { RagisShelf, RecentShelf, Shelf } from '~/components/Shelves';
import { useShabadActions } from '~/lib/use-shabad-actions';
import { useIsOnline } from '~/lib/network';
import { playerActions } from '~/lib/player';
import { useMiniPlayerSpace } from '~/lib/mini-player-space';
import { useColors } from '~/lib/theme';

export default function HomeScreen() {
  const colors = useColors();
  const { onMore, sheet } = useShabadActions();
  const miniPlayerSpace = useMiniPlayerSpace();
  const online = useIsOnline();

  if (!online) return <OfflineNotice />;

  return (
    <Screen edges={['top']} className="flex-1 bg-background">
      {/* Automatic insets: iOS pads the bottom by the tab bar and the player
          riding above it, so the ragi shelf can scroll clear of both. */}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={miniPlayerSpace}
        contentContainerClassName="gap-6 pb-6"
      >
        <View className="gap-4 px-5 pt-3">
          <AppHeader />
          {/* The broadcast is the one thing on this screen that is happening
                right now, so it gets the raised card and the accent. */}
          <View className="overflow-hidden rounded-2xl bg-card">
            <Pressable
              onPress={() => playerActions.play(stationPlayable(DEFAULT_STATION))}
              className="flex-row items-center gap-3 p-3 active:bg-accent"
            >
              <View className="size-14 items-center justify-center rounded-xl bg-primary-soft">
                <Radio size={24} color={colors.primary} />
              </View>
              <View className="min-w-0 flex-1 gap-0.5">
                <View className="flex-row items-center gap-1.5">
                  <View className="size-1.5 rounded-full bg-live" />
                  <Text className="text-[11px] font-semibold uppercase tracking-[0.08em] text-live">
                    Live
                  </Text>
                </View>
                <Text numberOfLines={1} className="text-[17px] font-semibold text-foreground">
                  {DEFAULT_STATION.name}
                </Text>
                <Text numberOfLines={1} className="text-[13px] text-muted-foreground">
                  {DEFAULT_STATION.place}
                </Text>
              </View>
              <View className="size-11 items-center justify-center rounded-full bg-primary">
                <Play size={20} color={colors.primaryForeground} fill={colors.primaryForeground} />
              </View>
            </Pressable>
          </View>
        </View>

        <RecentShelf onMore={onMore} />
        <Shelf title="Recently added" sort="newest" onMore={onMore} />
        <Shelf title="Popular" sort="popular" onMore={onMore} />

        <RagisShelf />
      </ScrollView>
      {sheet}
    </Screen>
  );
}
