/**
 * One search for everything: ragis first, then shabads — as the web's
 * (apps/player/src/routes/search.tsx).
 *
 * Ragis come first because a name that matches a ragi is almost always a
 * search for that ragi, and their shabads are one tap further on. They are
 * filtered on the device: the directory is one small cached list, and a round
 * trip per keystroke for it would be the slower way to get the same rows.
 */
import { useArtists, useSearch } from '@kp/api';
import type { Playable } from '@kp/core';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useDebounceValue } from 'usehooks-ts';

import { Input } from '@kp/ui-native/input';

import { RagiShelf } from '~/components/RagiShelf';
import { Screen } from '~/components/Screen';
import { ShabadRow } from '~/components/ShabadRow';
import { useShabadActions } from '~/lib/use-shabad-actions';
import { playerActions, usePlayer } from '~/lib/player';
import { supabase } from '~/lib/supabase';
import { useColors } from '~/lib/theme';

const RAGI_LIMIT = 8;

export default function SearchScreen() {
  const colors = useColors();
  const router = useRouter();
  const { onMore, sheet } = useShabadActions();
  const [term, setTerm] = useState('');
  const [debounced] = useDebounceValue(term, 250);
  const query = useSearch(supabase, debounced);
  const artists = useArtists(supabase);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const currentId = usePlayer((s) => s.current?.id);

  const trimmed = debounced.trim();
  const ready = trimmed.length >= 2;
  const needle = trimmed.toLowerCase();
  const ragis = ready
    ? (artists.data ?? [])
        .filter((a) => (a.display_name ?? a.name).toLowerCase().includes(needle))
        .slice(0, RAGI_LIMIT)
    : [];

  return (
    <Screen edges={['top']} className="flex-1 bg-background">
      <View className="flex-row items-center gap-1 px-2 pb-2 pt-3">
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Back"
          className="size-10 items-center justify-center"
        >
          <ChevronLeft size={22} color={colors.foreground} />
        </Pressable>
        <Input
          value={term}
          onChangeText={setTerm}
          autoFocus
          placeholder="Shabad or ragi…"
          placeholderTextColor={colors.mutedForeground}
          autoCorrect={false}
          // A shabad name is not a sentence, and iOS would shift the first
          // letter of every new query.
          autoCapitalize="none"
          returnKeyType="search"
          className="h-11 flex-1"
        />
      </View>

      {/* Said rather than left blank: a search box that does nothing for one
          character reads as broken. */}
      {!ready ? (
        <Text className="px-5 py-2 text-sm text-muted-foreground">
          Type at least two characters.
        </Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item: Playable) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerClassName="pb-4"
          ListHeaderComponent={
            <View className="gap-2 pb-1 pt-2">
              {ragis.length ? (
                <>
                  <Text className="px-5 text-sm font-medium text-foreground">Ragis</Text>
                  <RagiShelf artists={ragis} />
                </>
              ) : null}
              <Text className="px-5 pt-2 text-sm font-medium text-foreground">Shabads</Text>
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
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          onEndReachedThreshold={0.6}
          ListEmptyComponent={
            query.isLoading ? null : (
              <View className="gap-1 px-5 py-6">
                <Text className="text-sm text-foreground">Nothing matches “{trimmed}”.</Text>
                <Text className="text-sm text-muted-foreground">
                  Most of the archive is still untagged — it may simply not be findable yet.
                </Text>
              </View>
            )
          }
        />
      )}
      {sheet}
    </Screen>
  );
}
