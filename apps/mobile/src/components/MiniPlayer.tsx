import { clock, elapsedIn, progressPct, segmentTotal } from '@kp/core';
import { useRouter } from 'expo-router';
import { Heart, Pause, Play, SkipForward } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { PlayableArt } from '~/components/ArtTile';
import { PressableScale } from '~/components/PressableScale';
import { ShabadTitle } from '~/components/ShabadTitle';
import { playerActions, usePlayer } from '~/lib/player';
import { useSession } from '~/lib/session';
import { skipToNext } from '~/lib/skip';
import { useColors } from '~/lib/theme';

/**
 * The transport that rides above the tabs.
 *
 * It renders inside the capsule iOS draws for a tab-bar accessory, which is
 * already blurred and lifted — so this paints no background of its own, and
 * the one thing it adds to the capsule is a hairline of progress near its
 * foot, so a glance says how far in the rendition is without opening it.
 */
export function MiniPlayer() {
  const colors = useColors();
  const router = useRouter();
  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const { favorites } = useSession();

  if (!current) return null;

  const saved = favorites.has(current.id);

  const pct = current.isLive ? 0 : progressPct(current, position, duration);

  return (
    <View>
      <View className="flex-row items-center gap-3 py-2 pl-2 pr-3">
        <Pressable
          onPress={() => router.push('/now-playing')}
          className="min-w-0 flex-1 flex-row items-center gap-3"
        >
          <PlayableArt item={current} size={40} />
          <View className="min-w-0 flex-1">
            <ShabadTitle
              item={current}
              numberOfLines={1}
              className="text-sm font-semibold text-foreground"
            />
            <Text numberOfLines={1} className="text-xs tabular-nums text-muted-foreground">
              {current.isLive
                ? 'LIVE'
                : `${clock(elapsedIn(current, position))} / ${clock(
                    segmentTotal(current, duration)
                  )}`}
            </Text>
          </View>
        </Pressable>
        {/* Saving what is playing without opening the player, as the web's
            bar does. A broadcast is not a rendition, so it has none. */}
        {current.isLive ? null : (
          <PressableScale
            onPress={() => favorites.toggle(current.id)}
            accessibilityLabel={saved ? 'Remove from saved' : 'Save'}
            scaleTo={0.9}
            className="size-9 items-center justify-center"
          >
            <Heart
              size={18}
              color={saved ? colors.primary : colors.foreground}
              fill={saved ? colors.primary : 'transparent'}
            />
          </PressableScale>
        )}
        <PressableScale
          onPress={playerActions.toggle}
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          scaleTo={0.9}
          className="size-10 items-center justify-center"
        >
          {playing ? (
            <Pause size={22} color={colors.foreground} fill={colors.foreground} />
          ) : (
            <Play size={22} color={colors.foreground} fill={colors.foreground} />
          )}
        </PressableScale>
        <PressableScale
          onPress={() => void skipToNext()}
          scaleTo={0.9}
          disabled={current.isLive}
          accessibilityLabel="Next"
          className="size-10 items-center justify-center"
        >
          <SkipForward
            size={20}
            color={current.isLive ? colors.subtleForeground : colors.foreground}
            fill={current.isLive ? colors.subtleForeground : colors.foreground}
          />
        </PressableScale>
      </View>
      {/*
        A broadcast has no length, so it gets no line rather than an empty one.

        Inset and lifted off the foot rather than run edge to edge. The
        accessory is a capsule iOS draws, and a line flush to its bottom has
        both ends eaten by the corner — which is why the bar this file used to
        carry was removed. Held inside the corner radius it reads as a line
        with ends, not a line that has been cut.
      */}
      {current.isLive ? null : (
        <View className="mx-5 mb-1.5 h-0.5 overflow-hidden rounded-full bg-secondary">
          <View className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </View>
      )}
    </View>
  );
}
