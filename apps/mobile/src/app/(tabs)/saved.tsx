/**
 * Saved shabads.
 *
 * Works signed out: favorites live on the device until there is an account to
 * move them into.
 */

import { toPlayable, type Playable } from '@kp/core';
import { signOut } from '@kp/api';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Screen } from '~/components/Screen';
import { ShabadRow } from '~/components/ShabadRow';
import { useShabadActions } from '~/lib/use-shabad-actions';
import { useSession } from '~/lib/session';
import { playerActions, usePlayer } from '~/lib/player';
import { supabase } from '~/lib/supabase';

export default function SavedScreen() {
  const { onMore, sheet } = useShabadActions();
  const router = useRouter();
  const { favorites, userId } = useSession();
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
    <Screen edges={['top']} className="flex-1 bg-background">
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-2 pb-4"
        ListHeaderComponent={
          <View className="px-3 pb-2 pt-3">
            <Text className="text-2xl font-semibold text-foreground">Saved</Text>
            <Text className="text-sm text-muted-foreground">
              {userId
                ? 'Saved to your account.'
                : 'Saved on this device — sign in and they follow you.'}
            </Text>
            {!userId ? (
              <Pressable onPress={() => router.push('/sign-in')} className="pt-2">
                <Text className="text-sm text-primary">Sign in</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => void signOut(supabase)} className="pt-2">
                <Text className="text-sm text-muted-foreground">Sign out</Text>
              </Pressable>
            )}
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
          <Text className="px-3 py-8 text-sm text-muted-foreground">
            Nothing saved yet. Open a shabad and tap the heart.
          </Text>
        }
      />
      {sheet}
    </Screen>
  );
}
