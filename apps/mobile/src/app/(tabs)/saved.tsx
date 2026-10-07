/**
 * Library: Saved and Playlists, one switch apart — the web's Library tab
 * (apps/player/src/components/LibraryTabs.tsx).
 *
 * Saved works signed out: favorites live on the device until there is an
 * account to move them into. Playlists need one (PlaylistsList says why).
 */
import { shabadsByIds } from '@kp/api';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { AccountButton } from '~/components/AccountSheet';
import { PlaylistsList } from '~/components/PlaylistsList';
import { Screen } from '~/components/Screen';
import { ShabadRow } from '~/components/ShabadRow';
import { playerActions, usePlayer } from '~/lib/player';
import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';
import { useShabadActions } from '~/lib/use-shabad-actions';
import { cn } from '~/lib/utils';

type Shelf = 'saved' | 'playlists';

function LibraryHeader({ shelf, onShelf }: { shelf: Shelf; onShelf: (shelf: Shelf) => void }) {
  return (
    <View className="gap-3 px-5 pb-3 pt-3">
      <View className="flex-row items-center justify-between">
        <Text className="font-display text-[34px] leading-10 text-foreground">Library</Text>
        <AccountButton />
      </View>
      <View accessibilityRole="tablist" className="flex-row gap-1">
        {(['saved', 'playlists'] as const).map((s) => (
          <Pressable
            key={s}
            accessibilityRole="tab"
            accessibilityState={{ selected: s === shelf }}
            onPress={() => onShelf(s)}
            className={cn(
              'rounded-full px-4 py-1.5',
              s === shelf ? 'bg-primary-soft' : 'active:bg-accent'
            )}
          >
            <Text
              className={cn(
                'text-sm font-medium',
                s === shelf ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              {s === 'saved' ? 'Saved' : 'Playlists'}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function LibraryScreen() {
  const [shelf, setShelf] = useState<Shelf>('saved');
  const header = <LibraryHeader shelf={shelf} onShelf={setShelf} />;

  return (
    <Screen edges={['top']} className="flex-1 bg-background">
      {shelf === 'saved' ? <SavedList header={header} /> : <PlaylistsList header={header} />}
    </Screen>
  );
}

function SavedList({ header }: { header: React.ReactElement }) {
  const { onMore, sheet } = useShabadActions();
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
    <>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerClassName="pb-4"
        ListHeaderComponent={
          <View>
            {header}
            <Text className="px-5 pb-2 text-sm text-muted-foreground">
              {userId
                ? 'Saved to your account.'
                : 'Saved on this device — sign in and they follow you.'}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View className="px-2">
            <ShabadRow
              item={item}
              isCurrent={item.id === currentId}
              onPress={() => playerActions.playList(items, index)}
              onMore={onMore}
            />
          </View>
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
              className="px-5 py-6"
            >
              <Text className="text-sm text-destructive">
                Could not load your saved shabads. Tap to try again.
              </Text>
            </Pressable>
          ) : (
            <Text className="px-5 py-6 text-sm text-muted-foreground">
              Nothing saved yet. Tap the heart on any shabad.
            </Text>
          )
        }
      />
      {sheet}
    </>
  );
}
