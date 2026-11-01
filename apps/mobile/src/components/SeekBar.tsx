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
import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

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
  // Read on release, where the gesture no longer says where the finger was.
  const latest = useRef<number | null>(null);

  // Everything the gesture reads, as of the latest render. The gesture is built
  // once, so that a re-render at the playhead's 10Hz does not rebuild it mid-drag.
  const live = useRef({ current, duration, width });
  useEffect(() => {
    live.current = { current, duration, width };
  });

  /**
   * A gesture handler rather than the responder system, because this bar sits in
   * an iOS sheet. The sheet's own pan cancels any touch the responder system
   * holds as soon as a finger drifts about 14pt vertically, which real thumbs do,
   * so a drag stopped dead and pulled the sheet down, and if it survived to the
   * end it landed in onResponderTerminate rather than Release and never seeked.
   * Only tapping worked. A distance of zero makes this pan the first recognizer
   * to claim the touch, and UIKit then keeps the sheet's out of it.
   */
  /* eslint-disable react-hooks/refs -- only the gesture's callbacks touch these, on
     the JS thread when it fires. The rule cannot see through the builder chain. */
  const pan = useMemo(() => {
    const track = (x: number) => {
      const { width: w } = live.current;
      // Before onLayout there is no scale to measure against. Returning 0 without
      // recording it kept whatever the last gesture left behind, so a release in
      // that window seeked to a position nobody asked for.
      if (!w) return;
      const r = Math.min(1, Math.max(0, x / w));
      latest.current = r;
      setDragging(r);
    };
    return Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      .onBegin((e) => track(e.x))
      .onUpdate((e) => track(e.x))
      .onFinalize(() => {
        const r = latest.current;
        if (r != null) {
          const { current: item, duration: length } = live.current;
          playerActions.seek(seekTargetForPct(item, r * 100, length));
        }
        latest.current = null;
        setDragging(null);
      });
  }, []);
  /* eslint-enable react-hooks/refs */

  const pct = dragging != null ? dragging * 100 : progressPct(current, position, duration);

  // What the clock should read: where the finger is, or where playback is.
  const elapsed =
    dragging != null ? dragging * segmentTotal(current, duration) : elapsedIn(current, position);

  return (
    <View className="gap-1">
      {/* Its default is flex: 1, which collapses to nothing in a row sized by its
          content. */}
      <GestureHandlerRootView style={{ flex: 0, height: TOUCH_HEIGHT }}>
        <GestureDetector gesture={pan}>
          <View
            onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
            accessibilityRole="adjustable"
            accessibilityLabel="Seek"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
            style={{ height: TOUCH_HEIGHT, justifyContent: 'center' }}
          >
            <View className="h-1 rounded-full bg-secondary">
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
                  top: dragging != null ? -7 : -4,
                }}
              />
            </View>
          </View>
        </GestureDetector>
      </GestureHandlerRootView>

      <View className="flex-row justify-between">
        <Text className="text-xs tabular-nums text-subtle-foreground">{clock(elapsed)}</Text>
        <Text className="text-xs tabular-nums text-subtle-foreground">
          {clock(segmentTotal(current, duration))}
        </Text>
      </View>
    </View>
  );
}
