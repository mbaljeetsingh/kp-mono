/**
 * Saved shabads.
 *
 * Works signed out: favorites live on the device until there is an account to
 * move them into.
 */
import { useFavorites } from '@kp/api';
import { toPlayable, type Playable } from '@kp/core';
import { useQuery } from '@tanstack/react-query';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ShabadRow } from '~/components/ShabadRow';
import { playerActions, usePlayer } from '~/lib/player';
import { supabase } from '~/lib/supabase';

export default function SavedScreen() {
  // Signed-out for now on mobile: sign-in is a web flow today, and favorites
  // work on the device either way.
  const favorites = useFavorites(supabase, null);
  const currentId = usePlayer((s) => s.current?.id);
  const ids = favorites.ids;

  const query = useQuery({
    queryKey: ['favorites', 'rows', ids],
    queryFn: async (): Promise<Playable[]> => {
      if (!ids.length) return [];
      const { data, error } = await supabase.from('shabads').select('*').in('id', ids);
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      // Ordered by the saved list: somebody put these in an order and an
      // `in.()` filter does not preserve it.
      const byId = new Map(rows.map((r) => [r.id as string, r]));
      return ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((r) => toPlayable(r as never));
    },
    enabled: ids.length > 0,
  });

  const items = query.data ?? [];

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-950">
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-2 pb-4"
        ListHeaderComponent={
          <View className="px-3 pb-2 pt-3">
            <Text className="text-2xl font-semibold text-white">Saved</Text>
            <Text className="text-sm text-neutral-400">Saved on this device.</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <ShabadRow
            item={item}
            isCurrent={item.id === currentId}
            onPress={() => playerActions.playList(items, index)}
          />
        )}
        ListEmptyComponent={
          <Text className="px-3 py-8 text-sm text-neutral-400">
            Nothing saved yet. Open a shabad and tap the heart.
          </Text>
        }
      />
    </SafeAreaView>
  );
}
