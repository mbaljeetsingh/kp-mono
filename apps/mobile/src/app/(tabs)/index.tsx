/**
 * Recently tagged.
 *
 * Everything here comes from published shabads, never raw files — a 70-minute
 * set is not listenable until somebody has marked where each shabad begins.
 */
import { randomShabads, useShabads } from '@kp/api';
import { DEFAULT_STATION, stationPlayable, type Playable } from '@kp/core';
import { colors } from '@kp/tokens/colors';
import { useMutation } from '@tanstack/react-query';
import { Play, Radio, Shuffle } from 'lucide-react-native';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Screen } from '~/components/Screen';
import { ShabadRow } from '~/components/ShabadRow';
import { useShabadActions } from '~/lib/use-shabad-actions';
import { playerActions, usePlayer } from '~/lib/player';
import { supabase } from '~/lib/supabase';

export default function ShabadsScreen() {
  const { onMore, sheet } = useShabadActions();
  const query = useShabads(supabase);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const currentId = usePlayer((s) => s.current?.id);

  /**
   * Enough to listen through without thinking about it again, few enough that
   * the queue stays readable and a reshuffle is cheap.
   */
  const shuffle = useMutation({
    mutationFn: () => randomShabads(supabase, 30),
    onSuccess: (rows) => {
      if (rows.length) playerActions.playList(rows, 0);
    },
  });

  return (
    <Screen edges={['top']} className="flex-1 bg-background">
      <FlatList
        data={items}
        keyExtractor={(item: Playable) => item.id}
        contentContainerClassName="px-2 pb-4"
        ListHeaderComponent={
          <View className="gap-4 px-3 pb-2 pt-3">
            <View className="gap-1">
              <Text className="font-display text-[34px] leading-10 text-foreground">
                Kirtan Player
              </Text>
              <Text className="text-[15px] leading-5 text-muted-foreground">
                Twenty years of kirtan from Sri Harmandir Sahib.
              </Text>
            </View>
            {/* The broadcast is the one thing on this screen that is happening
                right now, so it gets the raised card and the accent. */}
            <Pressable
              onPress={() => playerActions.play(stationPlayable(DEFAULT_STATION))}
              className="flex-row items-center gap-3 rounded-2xl bg-card p-3 active:bg-accent"
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
            {/* The other ways in all need the listener to name something first.
                This is the one for arriving with nothing in mind — which for
                kirtan is not the unusual case. */}
            <Pressable
              disabled={shuffle.isPending}
              onPress={() => shuffle.mutate()}
              className="h-12 flex-row items-center justify-center gap-2 rounded-full bg-secondary active:bg-accent"
            >
              <Shuffle size={18} color={colors.primary} />
              <Text className="text-base font-semibold text-foreground">Shuffle the archive</Text>
            </Pressable>
            <Text className="pt-1 font-display text-[22px] leading-7 text-foreground">
              Recently tagged
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <ShabadRow
            item={item}
            isCurrent={item.id === currentId}
            // Playing a row loads the rest of the shelf behind it — otherwise
            // the queue holds one row and playback stops dead at its end.
            onPress={() => playerActions.playList(items, index)}
            onMore={onMore}
          />
        )}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.6}
        ListEmptyComponent={
          query.isLoading ? null : (
            <Text className="px-3 py-8 text-sm text-muted-foreground">Nothing tagged yet.</Text>
          )
        }
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <Text className="px-3 py-4 text-sm text-muted-foreground">Loading…</Text>
          ) : null
        }
      />
      {sheet}
    </Screen>
  );
}
