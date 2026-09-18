/**
 * The persistent transport.
 *
 * Above the tab bar and outside every screen, so navigating never interrupts
 * playback. Tapping it opens the full player.
 */
import { colors } from '@kp/tokens/colors';
import { clock, elapsedIn, progressPct, segmentTotal } from '@kp/core';
import { useRouter } from 'expo-router';
import { Pause, Play, SkipForward } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { ArtTile } from '~/components/ArtTile';
import { playerActions, usePlayer } from '~/lib/player';
import { skipToNext } from '~/lib/skip';
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
    <View className="border-t border-border bg-card">
      <View className="h-0.5 bg-muted">
        <View className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </View>

      <View className="flex-row items-center gap-3 px-3 py-2">
        <Pressable
          onPress={() => router.push('/now-playing')}
          className="min-w-0 flex-1 flex-row items-center gap-3"
        >
          <ArtTile
            name={current.artist ?? current.title}
            src={artistPhotoUrl(current.artistPhoto)}
            size={40}
          />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-sm font-medium text-foreground">
              {current.title}
            </Text>
            <Text numberOfLines={1} className="text-xs text-muted-foreground">
              {current.isLive
                ? 'LIVE'
                : `${clock(elapsedIn(current, position))} / ${clock(
                    segmentTotal(current, duration)
                  )}`}
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={playerActions.toggle}
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          className="size-10 items-center justify-center rounded-full bg-primary"
        >
          {playing ? (
            <Pause size={18} color={colors.primaryForeground} />
          ) : (
            <Play size={18} color={colors.primaryForeground} />
          )}
        </Pressable>

        <Pressable
          onPress={() => void skipToNext()}
          disabled={current.isLive}
          accessibilityLabel="Next"
          className="size-10 items-center justify-center"
        >
          <SkipForward
            size={18}
            color={current.isLive ? colors.mutedForeground : colors.foreground}
          />
        </Pressable>
      </View>
    </View>
  );
}
