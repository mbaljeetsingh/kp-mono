/**
 * The full player.
 *
 * What you scan sits at the top; what you touch sits at the bottom. The
 * transport is pinned below the scrolling text for the reason every music app
 * puts it there: the bottom third of a phone is where a thumb already rests.
 */
import { useShabadText } from '@kp/api';
import {
  elapsedIn,
  highlightVerseId,
  isAligned,
  progressPct,
  REPEAT_LABELS,
  seekTargetForPct,
  segmentTotal,
} from '@kp/core';
import { useRouter } from 'expo-router';
import { ChevronDown, Pause, Play, Repeat, Repeat1, SkipBack, SkipForward } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArtTile } from '~/components/ArtTile';
import { playerActions, usePlayer } from '~/lib/player';
import { artistPhotoUrl } from '~/lib/supabase';

/** BaniDB, direct on native: there is no browser origin to be blocked by CORS. */
const BANIDB_BASE = 'https://api.banidb.com/v2';

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function NowPlayingScreen() {
  const router = useRouter();

  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const repeat = usePlayer((s) => s.repeat);

  const query = useShabadText(BANIDB_BASE, current?.shabadId);
  const lines = query.data?.verses ?? [];
  const lit = highlightVerseId(current, position);

  const [trackWidth, setTrackWidth] = useState(0);

  if (!current) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-neutral-950">
        <Text className="text-neutral-400">Nothing playing.</Text>
      </SafeAreaView>
    );
  }

  const pct = progressPct(current, position, duration);
  const RepeatIcon = repeat === 'one' ? Repeat1 : Repeat;

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-neutral-950">
      <View className="flex-row items-center px-2 pt-2">
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Close"
          className="size-10 items-center justify-center">
          <ChevronDown size={22} color="#e5e5e5" />
        </Pressable>
      </View>

      <View className="flex-row items-center gap-3 px-4 pb-3">
        <ArtTile
          name={current.artist ?? current.title}
          src={artistPhotoUrl(current.artistPhoto)}
          size={56}
          rounded={10}
        />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-medium text-white">
            {current.title}
          </Text>
          <Text numberOfLines={1} className="text-sm text-neutral-400">
            {current.subtitle ?? current.artist}
          </Text>
          {current.isLive ? (
            <Text className="text-xs font-medium text-amber-400">LIVE</Text>
          ) : null}
        </View>
      </View>

      <ScrollView className="min-h-0 flex-1 px-4">
        {!current.shabadId ? (
          <Text className="py-6 text-center text-sm text-neutral-400">
            {current.isLive
              ? 'Nothing is tagged on a live broadcast.'
              : 'No shabad linked to this rendition yet.'}
          </Text>
        ) : null}

        {query.isLoading ? (
          <Text className="py-6 text-center text-sm text-neutral-400">Loading the shabad…</Text>
        ) : null}

        <View className="gap-3 pb-4">
          {lines.map((line) => (
            <View key={line.verseId}>
              <Text
                className={
                  line.verseId === lit ? 'text-base text-amber-400' : 'text-base text-neutral-400'
                }>
                {line.verse?.unicode ?? line.verse?.gurmukhi ?? ''}
              </Text>
              {line.translation?.en?.bdb ? (
                <Text className="pt-0.5 text-xs text-neutral-500">
                  {line.translation.en.bdb}
                </Text>
              ) : null}
            </View>
          ))}
        </View>

        {/* Said once, at the foot, so nobody reads a static highlight as a bug. */}
        {lines.length && !isAligned(current) ? (
          <Text className="pb-6 text-center text-xs text-neutral-600">
            This rendition has no line timings yet — the highlight is the tagged line.
          </Text>
        ) : null}
      </ScrollView>

      <View className="gap-3 border-t border-neutral-800 px-4 pb-4 pt-3">
        {current.isLive ? (
          <View className="h-6 items-center justify-center">
            <Text className="text-xs font-medium text-amber-400">LIVE</Text>
          </View>
        ) : (
          <View className="gap-1">
            <Pressable
              onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
              onPress={(e) => {
                if (!trackWidth) return;
                const ratio = Math.min(1, Math.max(0, e.nativeEvent.locationX / trackWidth));
                playerActions.seek(seekTargetForPct(current, ratio * 100, duration));
              }}
              accessibilityLabel="Seek"
              className="h-6 justify-center">
              <View className="h-1 overflow-hidden rounded-full bg-neutral-800">
                <View className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
              </View>
            </Pressable>
            <View className="flex-row justify-between">
              <Text className="text-xs text-neutral-500">
                {clock(elapsedIn(current, position))}
              </Text>
              <Text className="text-xs text-neutral-500">
                {clock(segmentTotal(current, duration))}
              </Text>
            </View>
          </View>
        )}

        <View className="flex-row items-center justify-center gap-4">
          <Pressable
            onPress={playerActions.previous}
            disabled={current.isLive}
            accessibilityLabel="Previous"
            className="size-12 items-center justify-center">
            <SkipBack size={22} color={current.isLive ? '#525252' : '#e5e5e5'} />
          </Pressable>

          <Pressable
            onPress={playerActions.toggle}
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            className="size-16 items-center justify-center rounded-full bg-amber-400">
            {playing ? <Pause size={26} color="#0a0a0a" /> : <Play size={26} color="#0a0a0a" />}
          </Pressable>

          <Pressable
            onPress={playerActions.next}
            disabled={current.isLive}
            accessibilityLabel="Next"
            className="size-12 items-center justify-center">
            <SkipForward size={22} color={current.isLive ? '#525252' : '#e5e5e5'} />
          </Pressable>

          <Pressable
            onPress={playerActions.cycleRepeat}
            // The name states what is on, not what a press would do — a cycle
            // of three has no single "would do".
            accessibilityLabel={REPEAT_LABELS[repeat]}
            className="size-12 items-center justify-center">
            <RepeatIcon size={20} color={repeat === 'off' ? '#a3a3a3' : '#fbbf24'} />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
