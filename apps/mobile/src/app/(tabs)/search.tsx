import { colors } from '@kp/tokens/colors';
import { useSearch } from '@kp/api';
import type { Playable } from '@kp/core';
import { useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { useDebounceValue } from 'usehooks-ts';

import { Screen } from '~/components/Screen';
import { ShabadRow } from '~/components/ShabadRow';
import { useShabadActions } from '~/lib/use-shabad-actions';
import { playerActions, usePlayer } from '~/lib/player';
import { supabase } from '~/lib/supabase';

export default function SearchScreen() {
  const { onMore, sheet } = useShabadActions();
  const [term, setTerm] = useState('');
  const [debounced] = useDebounceValue(term, 250);
  const query = useSearch(supabase, debounced);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const currentId = usePlayer((s) => s.current?.id);

  const ready = debounced.trim().length >= 2;

  return (
    <Screen edges={['top']} className="flex-1 bg-background">
      <View className="px-4 pb-2 pt-3">
        <Text className="pb-3 text-2xl font-semibold text-foreground">Search</Text>
        <TextInput
          value={term}
          onChangeText={setTerm}
          placeholder="Shabad or ragi…"
          placeholderTextColor={colors.mutedForeground}
          autoCorrect={false}
          // A shabad name is not a sentence, and iOS would shift the first
          // letter of every new query.
          autoCapitalize="none"
          className="rounded-lg border border-border bg-card px-4 py-3 text-foreground"
        />
      </View>

      {/* Said rather than left blank: a search box that does nothing for one
          character reads as broken. */}
      {!ready ? (
        <Text className="px-4 py-2 text-sm text-muted-foreground">
          Type at least two characters.
        </Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item: Playable) => item.id}
          contentContainerClassName="px-2 pb-4"
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
                Nothing matches “{debounced.trim()}”.
              </Text>
            )
          }
        />
      )}
      {sheet}
    </Screen>
  );
}
