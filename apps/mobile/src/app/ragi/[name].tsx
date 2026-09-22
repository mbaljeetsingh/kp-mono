import { colors } from '@kp/tokens/colors';
import { useShabadsByArtist } from '@kp/api';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Screen } from '~/components/Screen';
import { ShabadRow } from '~/components/ShabadRow';
import { useShabadActions } from '~/lib/use-shabad-actions';
import { playerActions, usePlayer } from '~/lib/player';
import { supabase } from '~/lib/supabase';

export default function RagiScreen() {
  const { onMore, sheet } = useShabadActions();
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name: string }>();
  const query = useShabadsByArtist(supabase, name ?? '');
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const currentId = usePlayer((s) => s.current?.id);

  return (
    <Screen edges={['top']} className="flex-1 bg-background">
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-2 pb-4"
        ListHeaderComponent={
          <View className="px-3 pb-2 pt-3">
            <Pressable onPress={() => router.back()} className="flex-row items-center gap-1 pb-2">
              <ChevronLeft size={16} color={colors.mutedForeground} />
              <Text className="text-sm text-muted-foreground">Ragis</Text>
            </Pressable>
            <Text className="font-display text-[28px] leading-8 text-foreground">{name}</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <ShabadRow
            item={item}
            isCurrent={item.id === currentId}
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
            <Text className="px-3 py-8 text-sm text-muted-foreground">
              Nothing tagged for this ragi yet.
            </Text>
          )
        }
      />
      {sheet}
    </Screen>
  );
}
