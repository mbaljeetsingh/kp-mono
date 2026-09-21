/**
 * The scrubber.
 *
 * A thumb you can drag, not a line you can tap. The first version was a 24pt
 * Pressable with `onPress` only: below Apple's 44pt minimum, so a finger aimed
 * at it often missed entirely, and even on target it could only jump to a point
 * — there was no way to scrub, which is the one gesture everybody brings to a
 * player from every other player.
 *
 * While a drag is in progress the bar follows the finger rather than the
 * playhead, and the elapsed clock reads the dragged position. Without that the
 * thumb springs back to wherever playback has got to on every status tick, ten
 * times a second, and the drag feels like it is fighting you.
 */
import {
  clock,
  elapsedIn,
  progressPct,
  seekTargetForPct,
  segmentTotal,
  type Playable,
} from '@kp/core';
import { useRef, useState } from 'react';
import { Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { playerActions } from '~/lib/player';

/** Apple's minimum touch target. The visible track stays thin inside it. */
const TOUCH_HEIGHT = 44;

export function SeekBar({
  current,
  position,
  duration,
}: {
  current: Playable;
  position: number;
  duration: number;
}) {
  const [width, setWidth] = useState(0);
  /** Ratio under the finger while dragging, or null when not. */
  const [dragging, setDragging] = useState<number | null>(null);
  // Read on release, where the event's own coordinates are already gone if the
  // finger left the track.
  const latest = useRef<number | null>(null);

  const ratioAt = (e: GestureResponderEvent) => {
    // Before onLayout there is no scale to measure against. Returning 0 without
    // recording it kept whatever the last gesture left behind, so a release in
    // that window seeked to a position nobody asked for.
    if (!width) return null;
    const r = Math.min(1, Math.max(0, e.nativeEvent.locationX / width));
    latest.current = r;
    return r;
  };

  const pct = dragging != null ? dragging * 100 : progressPct(current, position, duration);

  // What the clock should read: where the finger is, or where playback is.
  const elapsed =
    dragging != null ? dragging * segmentTotal(current, duration) : elapsedIn(current, position);

  return (
    <View className="gap-1">
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        // The responder system rather than a Pressable: it is the only way to
        // get grant/move/release out of a plain View without a gesture library.
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => setDragging(ratioAt(e))}
        onResponderMove={(e) => setDragging(ratioAt(e))}
        onResponderRelease={() => {
          if (latest.current != null) {
            playerActions.seek(seekTargetForPct(current, latest.current * 100, duration));
          }
          setDragging(null);
        }}
        onResponderTerminate={() => setDragging(null)}
        accessibilityRole="adjustable"
        accessibilityLabel="Seek"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
        style={{ height: TOUCH_HEIGHT, justifyContent: 'center' }}
      >
        <View className="h-1.5 rounded-full bg-muted">
          <View className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          {/* Drawn outside the track's own bounds, so it cannot be clipped by
              the rounded overflow the fill needs. Grows under the finger, which
              is the only feedback a thumb this small can give. */}
          <View
            pointerEvents="none"
            className="absolute rounded-full bg-primary"
            style={{
              left: `${pct}%`,
              width: dragging != null ? 18 : 12,
              height: dragging != null ? 18 : 12,
              marginLeft: dragging != null ? -9 : -6,
              top: dragging != null ? -6 : -3,
            }}
          />
        </View>
      </View>

      <View className="flex-row justify-between">
        <Text className="text-xs tabular-nums text-muted-foreground">{clock(elapsed)}</Text>
        <Text className="text-xs tabular-nums text-muted-foreground">
          {clock(segmentTotal(current, duration))}
        </Text>
      </View>
    </View>
  );
}
