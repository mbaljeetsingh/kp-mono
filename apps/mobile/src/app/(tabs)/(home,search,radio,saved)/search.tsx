/**
 * One search for everything: ragis first, then shabads — as the web's
 * (apps/player/src/routes/search.tsx).
 *
 * Ragis come first because a name that matches a ragi is almost always a
 * search for that ragi, and their shabads are one tap further on. They are
 * filtered on the device: the directory is one small cached list, and a round
 * trip per keystroke for it would be the slower way to get the same rows.
 * Their names are roman, so Punjabi keystrokes are never held against them.
 *
 * The header language decides what is typed: roman letters, or GurbaniLipi keys
 * drawn in the GurbaniLipi font, as the read-along's search takes them.
 */
import { minSearchLength, useArtists, useSearch } from '@kp/api';
import type { Playable } from '@kp/core';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useDebounceValue } from 'usehooks-ts';

import { AppHeader } from '~/components/AppHeader';
import { OfflineNotice } from '~/components/OfflineNotice';
import { RagiShelf } from '~/components/RagiShelf';
import { Screen } from '~/components/Screen';
import { DOCKED_KEYS_SPACE, ShabadInput } from '~/components/ShabadInput';
import { ShabadRow } from '~/components/ShabadRow';
import { ShabadRowSkeletons } from '~/components/ShabadRowSkeletons';
import { useMiniPlayerSpace } from '~/lib/mini-player-space';
import { useSearchKeys } from '~/lib/search-keys';
import { useShabadActions } from '~/lib/use-shabad-actions';
import { useIsOnline } from '~/lib/network';
import { playerActions, usePlayer } from '~/lib/player';
import { BANIDB_BASE } from '~/lib/links';
import { supabase } from '~/lib/supabase';
import { useColors } from '~/lib/theme';
import { useTitleScript } from '~/lib/title-script';
import { cn } from '~/lib/utils';

const RAGI_LIMIT = 8;

export default function SearchScreen() {
  const miniPlayerSpace = useMiniPlayerSpace();
  const colors = useColors();
  const { onMore: openMenu, sheet } = useShabadActions();
  const term = useSearchKeys((s) => s.term);
  const setTerm = useSearchKeys((s) => s.setTerm);
  const keysOpen = useSearchKeys((s) => s.keysOpen);
  const setKeysOpen = useSearchKeys((s) => s.setKeysOpen);
  const setKeysAvailable = useSearchKeys((s) => s.setKeysAvailable);
  const [focused, setFocused] = useState(false);
  const [debounced] = useDebounceValue(term, 250);
  const [script] = useTitleScript();
  const query = useSearch(supabase, BANIDB_BASE, debounced, script);
  const artists = useArtists(supabase);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const currentId = usePlayer((s) => s.current?.id);
  const online = useIsOnline();
  const keysAvailable = focused && online && script === 'pa';

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );
  useEffect(() => setKeysAvailable(keysAvailable), [keysAvailable, setKeysAvailable]);

  if (!online) return <OfflineNotice />;

  // The keys sit above any sheet on iOS, so they go down before one opens.
  const onMore: typeof openMenu = (...args) => {
    setKeysOpen(false);
    openMenu(...args);
  };

  const trimmed = debounced.trim();
  const min = minSearchLength(script);
  const ready = trimmed.length >= min;
  const needle = trimmed.toLowerCase();
  const ragis =
    ready && script === 'en'
      ? (artists.data ?? [])
          .filter((a) => (a.display_name ?? a.name).toLowerCase().includes(needle))
          .slice(0, RAGI_LIMIT)
      : [];

  return (
    <Screen edges={['top']} className="flex-1 bg-background">
      <View className="gap-3 px-5 pb-2 pt-3">
        <View onTouchStart={() => setKeysOpen(false)}>
          <AppHeader />
        </View>
        <ShabadInput
          value={term}
          onChangeText={setTerm}
          script={script}
          autoFocus
          placeholder={script === 'pa' ? 'ਪਹਿਲੇ ਅੱਖਰ ਲਿਖੋ…' : 'Shabad first letters or ragi…'}
          onPress={() => setKeysOpen(true)}
        />
      </View>

      {/* Takes what is left, so the results end where the keys begin. A touch
          here puts the keys down, as one outside the phone's keyboard would. */}
      <View className="flex-1" onTouchStart={() => setKeysOpen(false)}>
        {/* Said rather than left blank: a search box that does nothing for one
          character reads as broken. */}
        {!ready ? (
          <Text className="px-5 py-2 text-sm text-muted-foreground">
            Type at least {min} characters.
          </Text>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item: Playable) => item.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            // Reading the results takes the letters away, as it does the phone's keyboard.
            onScrollBeginDrag={() => setKeysOpen(false)}
            // Past the tab bar and the play controls riding above it.
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={miniPlayerSpace}
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
                {query.data?.pages[0]?.partial ? (
                  <Text className="px-5 text-sm text-muted-foreground">
                    Many lines match. Type another letter to narrow it.
                  </Text>
                ) : null}
                {query.data?.pages[0]?.degraded ? (
                  <Text className="px-5 text-sm text-muted-foreground">
                    First-letter search is unavailable right now. Showing titles and ragis.
                  </Text>
                ) : null}
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
            ListFooterComponent={
              query.isFetchNextPageError ? (
                <Pressable
                  onPress={() => void query.fetchNextPage()}
                  accessibilityRole="button"
                  className="px-5 py-3 active:opacity-60"
                >
                  <Text className="text-sm text-muted-foreground">
                    Could not load more. Tap to try again.
                  </Text>
                </Pressable>
              ) : null
            }
            ListEmptyComponent={
              // Pending, not loading: a request held for a connection is not loading, and
              // this empty text over it would say the list has nothing in it.
              query.isLoading ? (
                <View className="px-2">
                  <ShabadRowSkeletons />
                </View>
              ) : query.isPending ? null : (
                <View className="gap-1 px-5 py-6">
                  <Text className="text-sm text-foreground">
                    {query.isError
                      ? 'Could not search just now.'
                      : // Punjabi's term is GurbaniLipi keystrokes, which read as nonsense here.
                        script === 'pa'
                        ? 'Nothing matches.'
                        : `Nothing matches “${trimmed}”.`}
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    Most of the archive is still untagged — it may simply not be findable yet.
                  </Text>
                </View>
              )
            }
          />
        )}
      </View>

      {keysAvailable && keysOpen ? <View style={{ height: DOCKED_KEYS_SPACE }} /> : null}
      {sheet}
    </Screen>
  );
}
