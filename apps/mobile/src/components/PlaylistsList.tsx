/**
 * Playlists — account-only — as Library's second tab.
 *
 * Favorites survive without an account because losing one device's list costs
 * a few taps to rebuild. A named collection someone spent an hour assembling is
 * not something to keep on one device and hope, so this asks for a sign-in
 * rather than degrading.
 *
 * Each row has a visible ⋯ for rename and delete, as the web's does: delete
 * used to live behind a long-press, which nothing on screen admitted to.
 */
import { usePlaylistMutations, usePlaylists } from '@kp/api';
import { useRouter } from 'expo-router';
import { ListMusic, MoreHorizontal, Plus } from 'lucide-react-native';
import { useState, type ReactElement } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';

import { Input } from '@kp/ui-native/input';

import { useSession } from '~/lib/session';
import { useMiniPlayerSpace } from '~/lib/mini-player-space';
import { supabase } from '~/lib/supabase';
import { useColors } from '~/lib/theme';

/** A name field and its button, for both creating and renaming. */
function NameField({
  initial = '',
  action,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  action: string;
  busy: boolean;
  onSubmit: (name: string) => void;
  onCancel?: () => void;
}) {
  const colors = useColors();
  const [name, setName] = useState(initial);
  const ready = name.trim().length > 0 && !busy;

  return (
    <View className="gap-2">
      <Input
        value={name}
        onChangeText={setName}
        autoFocus
        // playlists_name_check: 1 to 120 characters.
        maxLength={120}
        placeholder="Morning kirtan"
        placeholderTextColor={colors.mutedForeground}
        returnKeyType="done"
        onSubmitEditing={() => ready && onSubmit(name)}
        className="h-12"
      />
      <View className="flex-row gap-2">
        {onCancel ? (
          <Pressable
            onPress={onCancel}
            className="flex-1 items-center rounded-lg bg-muted py-3 active:opacity-80"
          >
            <Text className="font-medium text-foreground">Cancel</Text>
          </Pressable>
        ) : null}
        <Pressable
          disabled={!ready}
          onPress={() => onSubmit(name)}
          className="flex-1 items-center rounded-lg bg-primary py-3 active:opacity-80"
        >
          <Text className="font-medium text-primary-foreground">{action}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function PlaylistsList({ header }: { header: ReactElement }) {
  const miniPlayerSpace = useMiniPlayerSpace();
  const colors = useColors();
  const router = useRouter();
  const { userId } = useSession();
  const query = usePlaylists(supabase, Boolean(userId));
  const { create, rename, remove } = usePlaylistMutations(supabase, userId);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);

  if (!userId) {
    return (
      <View className="flex-1">
        {header}
        <View className="gap-3 px-5 pt-2">
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
      </View>
    );
  }

  function menu(id: string, name: string) {
    Alert.alert(name, undefined, [
      { text: 'Rename', onPress: () => setRenaming(id) },
      {
        text: 'Delete',
        style: 'destructive',
        // Deleting a collection somebody assembled by hand asks first.
        onPress: () =>
          Alert.alert(`Delete “${name}”?`, 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () =>
                void remove.mutateAsync(id).catch(() => Alert.alert('Could not delete it')),
            },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <FlatList
      data={query.data ?? []}
      keyExtractor={(p) => p.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={miniPlayerSpace}
      contentContainerClassName="pb-4"
      ListHeaderComponent={
        <View>
          {header}
          <View className="gap-3 px-5 pb-2">
            {creating ? (
              <NameField
                action="Create"
                busy={create.isPending}
                onCancel={() => setCreating(false)}
                onSubmit={(name) =>
                  void create
                    .mutateAsync(name)
                    .then(() => setCreating(false))
                    .catch(() => Alert.alert('Could not create that playlist'))
                }
              />
            ) : (
              <Pressable
                onPress={() => setCreating(true)}
                className="flex-row items-center gap-3 rounded-lg py-2 active:opacity-70"
              >
                <View className="size-10 items-center justify-center rounded-md bg-primary-soft">
                  <Plus size={18} color={colors.primary} />
                </View>
                <Text className="font-medium text-primary">New playlist</Text>
              </Pressable>
            )}
          </View>
        </View>
      }
      renderItem={({ item }) =>
        renaming === item.id ? (
          <View className="px-5 py-2">
            <NameField
              initial={item.name}
              action="Rename"
              busy={rename.isPending}
              onCancel={() => setRenaming(null)}
              onSubmit={(name) =>
                void rename
                  .mutateAsync({ id: item.id, name })
                  .then(() => setRenaming(null))
                  .catch(() => Alert.alert('Could not rename it'))
              }
            />
          </View>
        ) : (
          <Pressable
            onPress={() => router.push({ pathname: '/playlist/[id]', params: { id: item.id } })}
            onLongPress={() => menu(item.id, item.name)}
            className="mx-2 flex-row items-center gap-3 rounded-lg px-3 py-2 active:bg-accent"
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
            <Pressable
              onPress={() => menu(item.id, item.name)}
              accessibilityLabel={`More for ${item.name}`}
              hitSlop={8}
              className="size-8 items-center justify-center"
            >
              <MoreHorizontal size={18} color={colors.subtleForeground} />
            </Pressable>
          </Pressable>
        )
      }
      ListEmptyComponent={
        query.data !== undefined ? (
          <View className="gap-1 px-5 py-6">
            <Text className="text-sm text-foreground">No playlists yet.</Text>
            <Text className="text-sm text-muted-foreground">
              Make one here, or from any shabad's ⋯ menu.
            </Text>
          </View>
        ) : query.isError ? (
          // Not "No playlists yet": fetchPlaylists throws so a failure never
          // reads as having none.
          <Pressable onPress={() => void query.refetch()} className="px-5 py-6">
            <Text className="text-sm text-destructive">
              Could not load your playlists. Tap to try again.
            </Text>
          </Pressable>
        ) : null
      }
    />
  );
}
