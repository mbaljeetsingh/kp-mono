/**
 * The persistent transport.
 *
 * Above the tab bar and outside every screen, so navigating never interrupts
 * playback. Tapping it opens the full player.
 */
import { elapsedIn, progressPct, segmentTotal } from '@kp/core';
import { useRouter } from 'expo-router';
import { Pause, Play, SkipForward } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { ArtTile } from '~/components/ArtTile';
import { playerActions, usePlayer } from '~/lib/player';
import { artistPhotoUrl } from '~/lib/supabase';

export function MiniPlayer() {
  const router = useRouter();
  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);

  // Nothing loaded means no bar at all, rather than a dead strip of controls.
  if (!current) return null;

  const pct = progressPct(current, position, duration);

  return (
    <View className="border-t border-neutral-800 bg-neutral-900">
      <View className="h-0.5 bg-neutral-800">
        <View className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
      </View>

      <View className="flex-row items-center gap-3 px-3 py-2">
        <Pressable
          onPress={() => router.push('/now-playing')}
          className="min-w-0 flex-1 flex-row items-center gap-3">
          <ArtTile
            name={current.artist ?? current.title}
            src={artistPhotoUrl(current.artistPhoto)}
            size={40}
          />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-sm font-medium text-white">
              {current.title}
            </Text>
            <Text numberOfLines={1} className="text-xs text-neutral-400">
              {current.isLive
                ? 'LIVE'
                : `${Math.floor(elapsedIn(current, position) / 60)}:${String(
                    Math.floor(elapsedIn(current, position) % 60)
                  ).padStart(2, '0')} / ${Math.floor(segmentTotal(current, duration) / 60)}:${String(
                    Math.floor(segmentTotal(current, duration) % 60)
                  ).padStart(2, '0')}`}
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={playerActions.toggle}
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          className="size-10 items-center justify-center rounded-full bg-amber-400">
          {playing ? <Pause size={18} color="#0a0a0a" /> : <Play size={18} color="#0a0a0a" />}
        </Pressable>

        <Pressable
          onPress={playerActions.next}
          disabled={current.isLive}
          accessibilityLabel="Next"
          className="size-10 items-center justify-center">
          <SkipForward size={18} color={current.isLive ? '#525252' : '#e5e5e5'} />
        </Pressable>
      </View>
    </View>
  );
}
