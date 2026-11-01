/**
 * Everything on the Recently played shelf, which shows only the latest few — as
 * on the web (apps/player/src/routes/recent.tsx).
 */
import { useRecentShabads } from '@kp/api';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Screen } from '~/components/Screen';
import { ShabadRow } from '~/components/ShabadRow';
import { ShabadRowSkeletons } from '~/components/ShabadRowSkeletons';
import { useMiniPlayerSpace } from '~/lib/mini-player-space';
import { playerActions, usePlayer } from '~/lib/player';
import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';
import { useColors } from '~/lib/theme';
import { useShabadActions } from '~/lib/use-shabad-actions';

export default function RecentScreen() {
  const miniPlayerSpace = useMiniPlayerSpace();
  const colors = useColors();
  const router = useRouter();
  const { onMore, sheet } = useShabadActions();
  const { userId } = useSession();
  const ids = usePlayer((s) => s.recentIds);
  const ready = usePlayer((s) => s.recentReady);
  const currentId = usePlayer((s) => s.current?.id);

  const query = useRecentShabads(supabase, userId, ids);
  const items = query.data ?? [];

  return (
    <Screen edges={['top']} className="flex-1 bg-background">
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        // Past the tab bar and the play controls riding above it.
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={miniPlayerSpace}
        contentContainerClassName="px-2 pb-4"
        ListHeaderComponent={
          <View className="gap-1 px-3 pb-2 pt-3">
            <Pressable onPress={() => router.back()} className="flex-row items-center gap-1 pb-1">
              <ChevronLeft size={16} color={colors.mutedForeground} />
              <Text className="text-sm text-muted-foreground">Home</Text>
            </Pressable>
            <Text className="font-display text-[28px] leading-8 text-foreground">
              Recently played
            </Text>
            <Text className="text-sm text-muted-foreground">
              {userId ? 'Follows your account.' : 'Kept on this device.'}
            </Text>
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
        ListEmptyComponent={
          // Until storage has been read, no ids does not yet mean nothing played.
          // Pending, not loading: a request held for a connection is not loading.
          !ready || query.isLoading ? (
            <ShabadRowSkeletons />
          ) : query.isError ? (
            <Pressable onPress={() => void query.refetch()} className="px-3 py-8">
              <Text className="text-sm text-destructive">
                Could not load what you played. Tap to try again.
              </Text>
            </Pressable>
          ) : ids.length > 0 && query.isPending ? null : (
            <View className="gap-1 px-3 py-8">
              <Text className="text-sm text-foreground">Nothing played yet.</Text>
              <Text className="text-sm text-muted-foreground">
                Shabads you play will appear here.
              </Text>
            </View>
          )
        }
      />
      {sheet}
    </Screen>
  );
}
