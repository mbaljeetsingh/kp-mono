/**
 * The whole archive, paged, in the order the listener picks.
 *
 * Home carries short shelves; this is where the endless lists belong. Each
 * shelf's "See all" lands here already sorted its way — as on the web
 * (apps/player/src/routes/shabads.tsx).
 */
import { useShabads, type ShabadSort } from '@kp/api';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Screen } from '~/components/Screen';
import { ShabadRow } from '~/components/ShabadRow';
import { playerActions, usePlayer } from '~/lib/player';
import { supabase } from '~/lib/supabase';
import { useColors } from '~/lib/theme';
import { useShabadActions } from '~/lib/use-shabad-actions';
import { cn } from '~/lib/utils';

const SORTS: { sort: ShabadSort; label: string }[] = [
  { sort: 'newest', label: 'Newest' },
  { sort: 'popular', label: 'Popular' },
];

export default function AllShabadsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { onMore, sheet } = useShabadActions();
  const params = useLocalSearchParams<{ sort?: string }>();
  const sort: ShabadSort = params.sort === 'popular' ? 'popular' : 'newest';
  const query = useShabads(supabase, sort);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const currentId = usePlayer((s) => s.current?.id);

  return (
    <Screen edges={['top']} className="flex-1 bg-background">
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-2 pb-4"
        ListHeaderComponent={
          <View className="gap-3 px-3 pb-2 pt-3">
            <Pressable onPress={() => router.back()} className="flex-row items-center gap-1">
              <ChevronLeft size={16} color={colors.mutedForeground} />
              <Text className="text-sm text-muted-foreground">Home</Text>
            </Pressable>
            <Text className="font-display text-[28px] leading-8 text-foreground">All shabads</Text>
            <View accessibilityRole="tablist" className="flex-row gap-1">
              {SORTS.map((s) => (
                <Pressable
                  key={s.sort}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: s.sort === sort }}
                  // setParams, not push: switching the order is the same screen,
                  // and Back should leave it rather than step through sorts.
                  onPress={() => router.setParams({ sort: s.sort })}
                  className={cn(
                    'rounded-full px-4 py-1.5',
                    s.sort === sort ? 'bg-primary-soft' : 'active:bg-accent'
                  )}
                >
                  <Text
                    className={cn(
                      'text-sm font-medium',
                      s.sort === sort ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {s.label}
                  </Text>
                </Pressable>
              ))}
            </View>
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
            <Text className="px-3 py-8 text-sm text-muted-foreground">Nothing published yet.</Text>
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
