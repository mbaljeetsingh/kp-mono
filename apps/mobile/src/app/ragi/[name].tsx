import { useShabadsByArtist } from '@kp/api';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ShabadRow } from '~/components/ShabadRow';
import { playerActions, usePlayer } from '~/lib/player';
import { supabase } from '~/lib/supabase';

export default function RagiScreen() {
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name: string }>();
  const query = useShabadsByArtist(supabase, name ?? '');
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const currentId = usePlayer((s) => s.current?.id);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-950">
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-2 pb-4"
        ListHeaderComponent={
          <View className="px-3 pb-2 pt-3">
            <Pressable onPress={() => router.back()} className="flex-row items-center gap-1 pb-2">
              <ChevronLeft size={16} color="#a3a3a3" />
              <Text className="text-sm text-neutral-400">Ragis</Text>
            </Pressable>
            <Text className="text-2xl font-semibold text-white">{name}</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <ShabadRow
            item={item}
            isCurrent={item.id === currentId}
            onPress={() => playerActions.playList(items, index)}
          />
        )}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.6}
        ListEmptyComponent={
          query.isLoading ? null : (
            <Text className="px-3 py-8 text-sm text-neutral-400">
              Nothing tagged for this ragi yet.
            </Text>
          )
        }
      />
    </SafeAreaView>
  );
}
