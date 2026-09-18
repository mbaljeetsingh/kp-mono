import { usePlaylist, usePlaylistItems } from '@kp/api';
import { colors } from '@kp/tokens/colors';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Play } from 'lucide-react-native';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Screen } from '~/components/Screen';
import { ShabadRow } from '~/components/ShabadRow';
import { useShabadActions } from '~/lib/use-shabad-actions';
import { playerActions, usePlayer } from '~/lib/player';
import { supabase } from '~/lib/supabase';

export default function PlaylistScreen() {
  const { onMore, sheet } = useShabadActions();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const playlist = usePlaylist(supabase, id ?? '');
  const items = usePlaylistItems(supabase, id ?? '');
  const currentId = usePlayer((s) => s.current?.id);

  const rows = items.data ?? [];

  return (
    <Screen edges={['top']} className="flex-1 bg-background">
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-2 pb-4"
        ListHeaderComponent={
          <View className="gap-2 px-3 pb-2 pt-3">
            <Pressable onPress={() => router.back()} className="flex-row items-center gap-1">
              <ChevronLeft size={16} color={colors.mutedForeground} />
              <Text className="text-sm text-muted-foreground">Playlists</Text>
            </Pressable>
            <View className="flex-row items-end justify-between">
              <View>
                <Text className="text-2xl font-semibold text-foreground">
                  {playlist.data?.name ?? 'Playlist'}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {rows.length} {rows.length === 1 ? 'shabad' : 'shabads'}
                </Text>
              </View>
              {rows.length ? (
                <Pressable
                  onPress={() => playerActions.playList(rows, 0)}
                  className="size-11 items-center justify-center rounded-full bg-primary active:opacity-80">
                  <Play size={20} color={colors.primaryForeground} />
                </Pressable>
              ) : null}
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <ShabadRow
            item={item}
            isCurrent={item.id === currentId}
            onPress={() => playerActions.playList(rows, index)}
            onMore={onMore}
          />
        )}
        ListEmptyComponent={
          items.isLoading ? null : (
            <Text className="px-3 py-8 text-sm text-muted-foreground">
              Nothing in this playlist yet.
            </Text>
          )
        }
      />
      {sheet}
    </Screen>
  );
}
