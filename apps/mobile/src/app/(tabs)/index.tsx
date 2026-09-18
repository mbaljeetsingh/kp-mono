/**
 * Recently tagged.
 *
 * Everything here comes from published shabads, never raw files — a 70-minute
 * set is not listenable until somebody has marked where each shabad begins.
 */
import { useShabads } from '@kp/api';
import type { Playable } from '@kp/core';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ShabadRow } from '~/components/ShabadRow';
import { playerActions, usePlayer } from '~/lib/player';
import { supabase } from '~/lib/supabase';

export default function ShabadsScreen() {
  const query = useShabads(supabase);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const currentId = usePlayer((s) => s.current?.id);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-950">
      <FlatList
        data={items}
        keyExtractor={(item: Playable) => item.id}
        contentContainerClassName="px-2 pb-4"
        ListHeaderComponent={
          <View className="px-3 pb-2 pt-3">
            <Text className="text-2xl font-semibold text-white">Kirtan Player</Text>
            <Text className="text-sm text-neutral-400">
              Twenty years of kirtan from Sri Harmandir Sahib.
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
          />
        )}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.6}
        ListEmptyComponent={
          query.isLoading ? null : (
            <Text className="px-3 py-8 text-sm text-neutral-400">Nothing tagged yet.</Text>
          )
        }
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <Text className="px-3 py-4 text-sm text-neutral-400">Loading…</Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
