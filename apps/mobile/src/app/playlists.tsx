/**
 * Playlists — account-only.
 *
 * Favorites survive without an account because losing one browser's list costs
 * a few taps to rebuild. A named collection someone spent an hour assembling is
 * not something to keep on one device and hope, so this asks for a sign-in
 * rather than degrading.
 */
import { usePlaylistMutations, usePlaylists } from '@kp/api';
import { useRouter } from 'expo-router';
import { ListMusic, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { colors } from '@kp/tokens/colors';

import { Input } from '@kp/ui-native/input';

import { Screen } from '~/components/Screen';
import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';

export default function PlaylistsScreen() {
  const router = useRouter();
  const { userId } = useSession();
  const query = usePlaylists(supabase, Boolean(userId));
  const { create, remove } = usePlaylistMutations(supabase, userId);

  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  if (!userId) {
    return (
      <Screen edges={['top']} className="flex-1 bg-background">
        <View className="gap-3 p-6">
          <Text className="text-2xl font-semibold text-foreground">Playlists</Text>
          <Text className="text-sm text-muted-foreground">
            Playlists need an account. A collection you spent time on should not live on one device.
          </Text>
          <Pressable
            onPress={() => router.push('/sign-in')}
            className="items-center rounded-lg bg-primary py-3 active:opacity-80"
          >
            <Text className="font-medium text-primary-foreground">Sign in</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']} className="flex-1 bg-background">
      <FlatList
        data={query.data ?? []}
        keyExtractor={(p) => p.id}
        contentContainerClassName="px-2 pb-4"
        ListHeaderComponent={
          <View className="gap-3 px-3 pb-2 pt-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-2xl font-semibold text-foreground">Playlists</Text>
              <Pressable
                onPress={() => setCreating((v) => !v)}
                accessibilityLabel="New playlist"
                className="size-9 items-center justify-center rounded-full bg-muted active:opacity-70"
              >
                <Plus size={18} color={colors.foreground} />
              </Pressable>
            </View>

            {creating ? (
              <View className="gap-2">
                <Input
                  value={name}
                  onChangeText={setName}
                  autoFocus
                  placeholder="Morning kirtan"
                  placeholderTextColor={colors.mutedForeground}
                  className="h-12"
                />
                <Pressable
                  disabled={!name.trim() || create.isPending}
                  onPress={() =>
                    void create
                      .mutateAsync(name)
                      .then(() => {
                        setName('');
                        setCreating(false);
                      })
                      .catch(() => Alert.alert('Could not create that playlist'))
                  }
                  className="items-center rounded-lg bg-primary py-3 active:opacity-80"
                >
                  <Text className="font-medium text-primary-foreground">Create</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/playlist/[id]', params: { id: item.id } })}
            onLongPress={() =>
              // Deleting a collection somebody assembled by hand asks first.
              Alert.alert(`Delete “${item.name}”?`, 'This cannot be undone.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => void remove.mutateAsync(item.id).catch(() => {}),
                },
              ])
            }
            className="flex-row items-center gap-3 rounded-lg px-3 py-2 active:bg-accent"
          >
            <View className="size-10 items-center justify-center rounded-md bg-muted">
              <ListMusic size={16} color={colors.mutedForeground} />
            </View>
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-foreground">
                {item.name}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {item.count} {item.count === 1 ? 'shabad' : 'shabads'}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          query.isLoading ? null : (
            <Text className="px-3 py-8 text-sm text-muted-foreground">
              No playlists yet. Tap + to make one.
            </Text>
          )
        }
      />
    </Screen>
  );
}
