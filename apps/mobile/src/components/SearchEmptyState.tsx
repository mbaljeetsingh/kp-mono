/**
 * Search before anything is typed, as the web's: the listener's recent searches,
 * then a way back to what they played, or the popular shabads if they have
 * played nothing.
 *
 * It scrolls in whatever the screen leaves it, so the Gurmukhi keys cover nothing
 * that cannot be reached, and it gets the room back when they close.
 */
import { History, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ShabadRowSkeletons } from '~/components/ShabadRowSkeletons';
import { RagisShelf, RecentShelf, Shelf, useRecentShelf } from '~/components/Shelves';
import type { useShabadActions } from '~/lib/use-shabad-actions';
import { useMiniPlayerSpace } from '~/lib/mini-player-space';
import { usePlayer } from '~/lib/player';
import { useRecentSearches } from '~/lib/recent-searches';
import { useSearchKeys } from '~/lib/search-keys';
import { useColors } from '~/lib/theme';
import { useTitleScript } from '~/lib/title-script';
import { cn } from '~/lib/utils';

const ROWS = 5;

export function SearchEmptyState({
  onMore,
  onSearch,
}: {
  onMore: ReturnType<typeof useShabadActions>['onMore'];
  onSearch: (term: string) => void;
}) {
  const miniPlayerSpace = useMiniPlayerSpace();
  const setKeysOpen = useSearchKeys((s) => s.setKeysOpen);
  const recentReady = usePlayer((s) => s.recentReady);
  const recent = useRecentShelf();
  // Playing a popular row makes this listener a returning one. Swapping the list
  // out from under the row they just tapped would lose their place in it.
  const [keepPopular, setKeepPopular] = useState(false);

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      // As the results: reading takes the letters away, as it does the phone's keyboard.
      onScrollBeginDrag={() => setKeysOpen(false)}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={miniPlayerSpace}
      contentContainerClassName="gap-6 pb-6 pt-2"
    >
      <RecentSearches onSearch={onSearch} />
      {!recentReady || recent.isLoading ? (
        // Not Popular: it would flash up before a returning listener's own list.
        <View className="px-2">
          <ShabadRowSkeletons />
        </View>
      ) : recent.data?.length && !keepPopular ? (
        <RecentShelf onMore={onMore} limit={ROWS} />
      ) : (
        <Shelf
          title="Popular"
          sort="popular"
          onMore={onMore}
          limit={ROWS}
          onPlay={() => setKeepPopular(true)}
        />
      )}
      <RagisShelf />
    </ScrollView>
  );
}

function RecentSearches({ onSearch }: { onSearch: (term: string) => void }) {
  const colors = useColors();
  const { terms, remove } = useRecentSearches();
  const [script] = useTitleScript();
  if (!terms.length) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel="Recent searches"
      contentContainerClassName="gap-2 px-5"
    >
      {terms.map((term) => (
        <View key={term} className="h-9 flex-row items-center rounded-full bg-accent pl-3 pr-1">
          <Pressable
            onPress={() => onSearch(term)}
            accessibilityRole="button"
            className="h-full flex-row items-center gap-1.5 active:opacity-60"
          >
            <History size={14} color={colors.mutedForeground} />
            <Text
              numberOfLines={1}
              className={cn(
                'text-sm text-foreground',
                script === 'pa' && 'font-gurmukhi text-base leading-6'
              )}
            >
              {term}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => remove(term)}
            accessibilityRole="button"
            // A Punjabi term is GurbaniLipi keys: a screen reader would spell out nonsense.
            accessibilityLabel={script === 'pa' ? 'Remove this search' : `Remove ${term}`}
            hitSlop={4}
            className="size-7 items-center justify-center active:opacity-60"
          >
            <X size={12} color={colors.mutedForeground} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}
