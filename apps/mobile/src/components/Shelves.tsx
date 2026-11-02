/**
 * The shelves Home and an empty Search share, as the web's
 * (apps/player/src/components/Shelves.tsx).
 *
 * Search shows fewer rows of the same lists, so `limit` trims what is drawn and
 * not what is asked for: both screens read one cached query.
 */
import { shelfShabads, useArtists, useRecentShabads, type ShabadSort } from '@kp/api';
import { RECENT_SHELF_FETCH, type Playable } from '@kp/core';
import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { RagiShelf } from '~/components/RagiShelf';
import { ShabadRow } from '~/components/ShabadRow';
import { ShabadRowSkeletons } from '~/components/ShabadRowSkeletons';
import type { useShabadActions } from '~/lib/use-shabad-actions';
import { playerActions, usePlayer } from '~/lib/player';
import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';

/** As the web's shelves. */
const SHELF_LIMIT = 8;
const RAGI_LIMIT = 12;

type OnMore = ReturnType<typeof useShabadActions>['onMore'];

/** The recent list, from the same query the shelf reads. */
export function useRecentShelf() {
  const { userId } = useSession();
  const ids = usePlayer((s) => s.recentIds);
  return useRecentShabads(supabase, userId, ids.slice(0, RECENT_SHELF_FETCH));
}

function ShelfHeader({ title, href }: { title: string; href: Href }) {
  const router = useRouter();
  return (
    <View className="flex-row items-baseline justify-between px-5">
      <Text className="font-display text-[22px] leading-7 text-foreground">{title}</Text>
      <Pressable onPress={() => router.navigate(href)} hitSlop={8}>
        <Text className="text-[13px] text-muted-foreground">See all</Text>
      </Pressable>
    </View>
  );
}

/**
 * The way back in, as on the web's Home: first because it is the one list about
 * this listener, and nothing at all before they have played anything.
 *
 * What is playing stays on it, lit like any other shelf's row. It used to be left
 * out, so replaying a shabad from here looked like playing it removed it, and
 * the only entry there was took the whole shelf with it.
 */
export function RecentShelf({ onMore, limit = SHELF_LIMIT }: { onMore: OnMore; limit?: number }) {
  const currentId = usePlayer((s) => s.current?.id);
  const query = useRecentShelf();
  const items = (query.data ?? []).slice(0, limit);
  if (!items.length) return null;

  return (
    <View className="gap-1">
      <ShelfHeader title="Recently played" href="/recent" />
      <View className="px-2">
        {items.map((item, index) => (
          <ShabadRow
            key={item.id}
            item={item}
            isCurrent={item.id === currentId}
            onPress={() => playerActions.playList(items, index)}
            onMore={onMore}
          />
        ))}
      </View>
    </View>
  );
}

export function Shelf({
  title,
  sort,
  onMore,
  limit = SHELF_LIMIT,
  onPlay,
}: {
  title: string;
  sort: ShabadSort;
  onMore: OnMore;
  limit?: number;
  onPlay?: (item: Playable) => void;
}) {
  const currentId = usePlayer((s) => s.current?.id);
  const query = useQuery({
    queryKey: ['shabads', sort, SHELF_LIMIT],
    queryFn: () => shelfShabads(supabase, SHELF_LIMIT, sort),
  });
  const items = (query.data ?? []).slice(0, limit);

  return (
    <View className="gap-1">
      <ShelfHeader title={title} href={sort === 'popular' ? '/shabads?sort=popular' : '/shabads'} />
      <View className="px-2">
        {items.map((item, index) => (
          <ShabadRow
            key={item.id}
            item={item}
            isCurrent={item.id === currentId}
            // Playing a row loads the rest of the shelf behind it — otherwise
            // the queue holds one row and playback stops dead at its end.
            onPress={() => {
              playerActions.playList(items, index);
              onPlay?.(item);
            }}
            onMore={onMore}
          />
        ))}
        {query.isLoading ? <ShabadRowSkeletons /> : null}
        {!query.isLoading && !items.length ? (
          <Text className="px-3 py-4 text-sm text-muted-foreground">Nothing published yet.</Text>
        ) : null}
      </View>
    </View>
  );
}

export function RagisShelf() {
  const artists = useArtists(supabase);
  if (!artists.data?.length) return null;

  return (
    <View className="gap-2">
      <ShelfHeader title="Ragis" href="/ragis" />
      <RagiShelf artists={artists.data.slice(0, RAGI_LIMIT)} />
    </View>
  );
}
