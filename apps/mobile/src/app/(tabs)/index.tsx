/**
 * Home: shelves, as on the web (apps/player/src/routes/index.tsx).
 *
 * Everything here comes from published shabads, never raw files — a 70-minute
 * set is not listenable until somebody has marked where each shabad begins.
 * Shelves rather than one endless list: short enough that the next one is
 * still in reach, with the whole archive a "See all" away.
 */
import { randomShabads, shelfShabads, useArtists, type ShabadSort } from '@kp/api';
import { DEFAULT_STATION, stationPlayable } from '@kp/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { Play, Radio, Search, Shuffle } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { LanguageSelector } from '~/components/LanguageSelector';
import { Screen } from '~/components/Screen';
import { RagiShelf } from '~/components/RagiShelf';
import { ThemeSelector } from '~/components/ThemeSelector';
import { ShabadRow } from '~/components/ShabadRow';
import { useShabadActions } from '~/lib/use-shabad-actions';
import { playerActions, usePlayer } from '~/lib/player';
import { useMiniPlayerSpace } from '~/lib/mini-player-space';
import { supabase } from '~/lib/supabase';
import { useColors } from '~/lib/theme';

/** As the web's shelves. */
const SHELF_LIMIT = 8;
const RAGI_LIMIT = 12;

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { onMore, sheet } = useShabadActions();
  const artists = useArtists(supabase);
  const miniPlayerSpace = useMiniPlayerSpace();

  /**
   * Enough to listen through without thinking about it again, few enough that
   * the queue stays readable and a reshuffle is cheap.
   */
  const shuffle = useMutation({
    mutationFn: () => randomShabads(supabase, 30),
    onSuccess: (rows) => {
      if (rows.length) playerActions.playList(rows, 0);
    },
  });

  return (
    <Screen edges={['top']} className="flex-1 bg-background">
      {/* Automatic insets: iOS pads the bottom by the tab bar and the player
          riding above it, so the ragi shelf can scroll clear of both. */}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={miniPlayerSpace}
        contentContainerClassName="gap-6 pb-6"
      >
        <View className="gap-4 px-5 pt-3">
          {/* The web's phone header: search, shuffle, the language and the
              theme — the things a listener reaches for from anywhere. */}
          <View className="flex-row items-center justify-end gap-2">
            <Pressable
              onPress={() => router.push('/search')}
              accessibilityLabel="Search"
              className="size-8 items-center justify-center rounded-lg bg-muted active:bg-accent"
            >
              <Search size={16} color={colors.foreground} />
            </Pressable>
            {/* For arriving with nothing in mind — which for kirtan is not the
                unusual case. */}
            <Pressable
              disabled={shuffle.isPending}
              onPress={() => shuffle.mutate()}
              accessibilityLabel="Shuffle the archive"
              className="size-8 items-center justify-center rounded-lg bg-muted active:bg-accent"
            >
              <Shuffle size={16} color={colors.foreground} />
            </Pressable>
            <LanguageSelector />
            <ThemeSelector />
          </View>
          <View className="gap-1">
            <Text className="font-display text-[34px] leading-10 text-foreground">
              Kirtan Player
            </Text>
            <Text className="text-[15px] leading-5 text-muted-foreground">
              Twenty years of kirtan from Sri Harmandir Sahib.
            </Text>
          </View>
          {/* The broadcast is the one thing on this screen that is happening
                right now, so it gets the raised card and the accent. */}
          <Pressable
            onPress={() => playerActions.play(stationPlayable(DEFAULT_STATION))}
            className="flex-row items-center gap-3 rounded-2xl bg-card p-3 active:bg-accent"
          >
            <View className="size-14 items-center justify-center rounded-xl bg-primary-soft">
              <Radio size={24} color={colors.primary} />
            </View>
            <View className="min-w-0 flex-1 gap-0.5">
              <View className="flex-row items-center gap-1.5">
                <View className="size-1.5 rounded-full bg-live" />
                <Text className="text-[11px] font-semibold uppercase tracking-[0.08em] text-live">
                  Live
                </Text>
              </View>
              <Text numberOfLines={1} className="text-[17px] font-semibold text-foreground">
                {DEFAULT_STATION.name}
              </Text>
              <Text numberOfLines={1} className="text-[13px] text-muted-foreground">
                {DEFAULT_STATION.place}
              </Text>
            </View>
            <View className="size-11 items-center justify-center rounded-full bg-primary">
              <Play size={20} color={colors.primaryForeground} fill={colors.primaryForeground} />
            </View>
          </Pressable>
          <Pressable onPress={() => router.navigate('/radio')} className="self-end -mt-2">
            <Text className="text-[13px] text-muted-foreground">All stations</Text>
          </Pressable>
        </View>

        <Shelf title="Recently added" sort="newest" onMore={onMore} />
        <Shelf title="Popular" sort="popular" onMore={onMore} />

        {artists.data?.length ? (
          <View className="gap-2">
            <ShelfHeader title="Ragis" href="/ragis" />
            <RagiShelf artists={artists.data.slice(0, RAGI_LIMIT)} />
          </View>
        ) : null}
      </ScrollView>
      {sheet}
    </Screen>
  );
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

function Shelf({
  title,
  sort,
  onMore,
}: {
  title: string;
  sort: ShabadSort;
  onMore: ReturnType<typeof useShabadActions>['onMore'];
}) {
  const currentId = usePlayer((s) => s.current?.id);
  const query = useQuery({
    queryKey: ['shabads', sort, SHELF_LIMIT],
    queryFn: () => shelfShabads(supabase, SHELF_LIMIT, sort),
  });
  const items = query.data ?? [];

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
            onPress={() => playerActions.playList(items, index)}
            onMore={onMore}
          />
        ))}
        {!query.isLoading && !items.length ? (
          <Text className="px-3 py-4 text-sm text-muted-foreground">Nothing published yet.</Text>
        ) : null}
      </View>
    </View>
  );
}
