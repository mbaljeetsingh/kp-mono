/**
 * The launch screen's last second, played rather than cut.
 *
 * The native splash (app.json, expo-splash-screen) is a still image the OS
 * draws before any JavaScript runs, so it cannot move. This overlay is drawn to
 * match it exactly — the same navy, the same mark at the same size and place —
 * so hiding the native one under it is invisible. Then the play button is
 * pressed and the mark zooms through, the way it opens onto the app.
 *
 * Once per cold start: it lives in the root layout, which a return from the
 * background (kirtan playing behind the lock screen) does not remount. With
 * Reduce Motion on it only fades, and so it does for a link that opens the app
 * on a modal (a shared recording opens the player): the modal is native and
 * slides up over this view, so the mark would play behind the sheet. Reanimated rather than Lottie: the mark is
 * already shapes, and a native dependency would cost a store release.
 *
 * The geometry is the splash PNG's (assets/images/splash-icon.png): the logo's
 * triangle-and-ka group drawn at 16x on a 1024 canvas, offset (-48, 8), shown
 * 140pt wide. Change either and they part company on the first frame.
 */
import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';

const LETTER =
  'M652 535 644 520H524Q528 499 529.5 478.0Q531 457 531 436Q531 376 518.5 321.5Q506 267 482 222Q509 170 531.5 105.5Q554 41 569 -33L553 -44L424 -7Q417 27 408.5 59.0Q400 91 390 119Q362 95 327.0 82.0Q292 69 255 69Q210 69 168.0 84.0Q126 99 92.5 125.5Q59 152 39.0 187.0Q19 222 19 263Q19 306 42.0 345.0Q65 384 107.0 408.0Q149 432 206 432Q258 432 304.5 409.0Q351 386 391 343Q399 366 403.0 391.5Q407 417 407 446Q407 463 405.5 482.0Q404 501 400 520H-11L-44 607L-36 622H619ZM220 156Q259 156 295.0 178.0Q331 200 354 238Q331 277 300.5 297.5Q270 318 232 318Q200 318 177.5 305.5Q155 293 143.0 274.0Q131 255 131 234Q131 215 141.5 197.0Q152 179 171.5 167.5Q191 156 220 156Z';

/** app.json's splash: one navy for both themes. */
const NAVY = '#113979';
const SIZE = 140;

/*
 * The press scales the whole mark, letter and all — a button going down — about
 * the triangle's centre: its box is x 48–992, y 88–952 of the 1024 canvas.
 */
// In points, as [x, y, z]: React Native rejects a percentage string with decimals.
const PIVOT = (520 / 1024) * SIZE;
const PRESS_ORIGIN: [number, number, number] = [PIVOT, PIVOT, 0];

/*
 * About 0.8 s in all, and none of it holds the app back: everything under the
 * overlay has already mounted and loads on regardless, and touches pass through.
 */
const PRESS_AT = 50;
const ZOOM_AT = PRESS_AT + 430;
const ZOOM_FOR = 330;

export function SplashHandoff() {
  const pathname = usePathname();
  // Where the app opened, read once: Home is '/', and anything else is a link.
  const [deepLinked] = useState(() => pathname !== '/');
  const reduceMotion = useReducedMotion();
  const quiet = reduceMotion || deepLinked;
  const [done, setDone] = useState(false);

  const press = useSharedValue(1);
  const zoom = useSharedValue(1);
  const fade = useSharedValue(1);

  useEffect(() => {
    function start() {
      if (quiet) {
        fade.value = withTiming(0, { duration: 200 });
      } else {
        press.value = withDelay(
          PRESS_AT,
          withSequence(
            withTiming(0.82, { duration: 150, easing: Easing.out(Easing.quad) }),
            withSpring(1, { damping: 9, stiffness: 260, mass: 0.6 })
          )
        );
        zoom.value = withDelay(
          ZOOM_AT,
          withTiming(7, { duration: ZOOM_FOR, easing: Easing.in(Easing.cubic) })
        );
        fade.value = withDelay(
          ZOOM_AT + 60,
          withTiming(0, { duration: ZOOM_FOR - 60, easing: Easing.in(Easing.quad) })
        );
      }
      // Gone, not just transparent: an invisible full-screen view still takes touches.
      return setTimeout(() => setDone(true), quiet ? 220 : ZOOM_AT + ZOOM_FOR + 20);
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    // Not from mount: the whole tab tree is being built under this in the same
    // moment, and an animation timed from then ran while no frames were drawn —
    // the mark sat still and vanished. Two frames later the tree is on screen.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        timer = start();
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [quiet, press, zoom, fade]);

  const screenStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const markStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value * zoom.value }],
  }));

  if (done) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.screen, screenStyle]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.mark, { transformOrigin: PRESS_ORIGIN }, markStyle]}>
        <Svg width={SIZE} height={SIZE} viewBox="0 0 1024 1024">
          <Defs>
            <ClipPath id="splash-line">
              <Rect x={-200} y={520} width={1200} height={400} />
            </ClipPath>
            <ClipPath id="splash-body">
              <Rect x={-200} y={-200} width={1200} height={720} />
            </ClipPath>
          </Defs>
          <G transform="translate(-48 8) scale(16)">
            <Path
              d="M9 8V56L62 32Z"
              fill="#ffffff"
              stroke="#ffffff"
              strokeWidth={6}
              strokeLinejoin="round"
            />
            <G transform="translate(14.053 42.197) scale(0.03529 -0.03529)">
              <Path d={LETTER} fill="#d28423" clipPath="url(#splash-line)" />
              <Path d={LETTER} fill={NAVY} clipPath="url(#splash-body)" />
            </G>
          </G>
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  mark: { width: SIZE, height: SIZE },
});
