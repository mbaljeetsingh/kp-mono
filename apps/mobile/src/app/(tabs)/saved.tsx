/**
 * Saved shabads.
 *
 * Works signed out: favorites live on the device until there is an account to
 * move them into.
 */

import { deleteOwnAccount, shabadsByIds, signOut } from '@kp/api';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Alert, FlatList, Linking, Pressable, Text, View } from 'react-native';

import { Screen } from '~/components/Screen';
import { ShabadRow } from '~/components/ShabadRow';
import { PRIVACY_URL } from '~/lib/links';
import { useShabadActions } from '~/lib/use-shabad-actions';
import { useSession } from '~/lib/session';
import { playerActions, usePlayer } from '~/lib/player';
import { supabase } from '~/lib/supabase';

/**
 * Both stores require account deletion inside any app that offers sign-up.
 * Asked twice over — an alert, not an undo — because nothing brings it back.
 */
function confirmDeleteAccount() {
  Alert.alert(
    'Delete your account?',
    'Your favorites and playlists are deleted with it. Shabads you tagged stay in the archive without your name. This cannot be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete account',
        style: 'destructive',
        onPress: async () => {
          const { error } = await deleteOwnAccount(supabase);
          if (error) Alert.alert('Could not delete the account', error);
        },
      },
    ]
  );
}

export default function SavedScreen() {
  const { onMore, sheet } = useShabadActions();
  const router = useRouter();
  const { favorites, userId } = useSession();
  const currentId = usePlayer((s) => s.current?.id);
  const ids = favorites.ids;

  const query = useQuery({
    queryKey: ['favorites', 'rows', ids],
    queryFn: () => shabadsByIds(supabase, ids),
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
            <Text className="font-display text-[34px] leading-10 text-foreground">Saved</Text>
            <Text className="text-sm text-muted-foreground">
              {userId
                ? 'Saved to your account.'
                : 'Saved on this device — sign in and they follow you.'}
            </Text>
            {/* Playlists lost their tab when the bar went native — iOS shows
                five and hides the rest behind "More", and Saved is the better
                of the two to keep. This is how they are reached now. */}
            <Pressable onPress={() => router.push('/playlists')} className="pt-2">
              <Text className="text-sm text-primary">Playlists</Text>
            </Pressable>

            {!userId ? (
              <Pressable onPress={() => router.push('/sign-in')} className="pt-2">
                <Text className="text-sm text-primary">Sign in</Text>
              </Pressable>
            ) : (
              <View className="flex-row gap-5 pt-2">
                <Pressable onPress={() => void signOut(supabase)}>
                  <Text className="text-sm text-muted-foreground">Sign out</Text>
                </Pressable>
                <Pressable onPress={confirmDeleteAccount}>
                  <Text className="text-sm text-muted-foreground">Delete account</Text>
                </Pressable>
              </View>
            )}
            <Pressable onPress={() => void Linking.openURL(PRIVACY_URL)} className="pt-2">
              <Text className="text-sm text-muted-foreground">Privacy</Text>
            </Pressable>
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
          favorites.failed || (query.isError && query.data === undefined) ? (
            // A failed read is not an empty list: "Nothing saved yet" over an
            // account with saved shabads reads as losing them.
            <Pressable
              onPress={() => {
                favorites.retry();
                void query.refetch();
              }}
              className="px-3 py-8"
            >
              <Text className="text-sm text-destructive">
                Could not load your saved shabads. Tap to try again.
              </Text>
            </Pressable>
          ) : (
            <Text className="px-3 py-8 text-sm text-muted-foreground">
              Nothing saved yet. Open a shabad and tap the heart.
            </Text>
          )
        }
      />
      {sheet}
    </Screen>
  );
}
