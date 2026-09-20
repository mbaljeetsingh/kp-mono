/**
 * The persistent transport.
 *
 * Lives in NativeTabs.BottomAccessory — the slot iOS 26 puts above the tab
 * bar — so it is outside every screen and navigating never interrupts
 * playback. Tapping it opens the full player.
 *
 * No border, no background and no progress bar: the accessory is a floating
 * pill iOS draws and blurs itself, and a full-width bar's furniture fights
 * that shape. The line this used to carry had both ends swallowed by the
 * pill's corners; the elapsed time beneath the title says the same thing, and
 * the real scrubber is one tap away.
 */
import { colors } from '@kp/tokens/colors';
import { clock, elapsedIn, segmentTotal } from '@kp/core';
import { useRouter } from 'expo-router';
import { Pause, Play, SkipForward } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { ArtTile } from '~/components/ArtTile';
import { PressableScale } from '~/components/PressableScale';
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

  return (
    /*
     * No border and no background: this sits in NativeTabs.BottomAccessory,
     * which is a floating pill iOS draws and blurs itself. The full-width bar
     * this used to be brought a top border that had nothing to divide and a
     * progress line whose ends disappeared into the pill's corners.
     */
    <View className="px-4 py-2">
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={() => router.push('/now-playing')}
          className="min-w-0 flex-1 flex-row items-center gap-3"
        >
          <ArtTile
            name={current.artist ?? current.title}
            src={artistPhotoUrl(current.artistPhoto)}
            size={36}
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

        <PressableScale
          onPress={playerActions.toggle}
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          scaleTo={0.9}
          className="size-9 items-center justify-center rounded-full bg-primary"
        >
          {playing ? (
            <Pause size={18} color={colors.primaryForeground} />
          ) : (
            <Play size={18} color={colors.primaryForeground} />
          )}
        </PressableScale>

        <PressableScale
          onPress={() => void skipToNext()}
          scaleTo={0.9}
          disabled={current.isLive}
          accessibilityLabel="Next"
          className="size-9 items-center justify-center"
        >
          <SkipForward
            size={18}
            color={current.isLive ? colors.mutedForeground : colors.foreground}
          />
        </PressableScale>
      </View>
    </View>
  );
}
