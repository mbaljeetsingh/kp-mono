/**
 * One line of the read-along, lighting and dimming as the singing moves.
 *
 * The only animation in the app that carries meaning rather than polish. The
 * highlight used to switch instantly, which on a sparse alignment reads as a
 * glitch: a line snaps to orange, and a few seconds later another one does,
 * with nothing connecting them. A short fade makes the two read as one
 * movement — the same reason karaoke wipes rather than cuts.
 *
 * Colour is interpolated rather than swapped because there is no other way to
 * animate it: React Native cannot transition a class, and the two ends are
 * theme tokens, so they are read once and handed to the worklet as numbers.
 */
import { colors } from '@kp/tokens/colors';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import { Text, View, type LayoutChangeEvent } from 'react-native';

/**
 * Long enough to read as a fade, short enough that it has finished before the
 * line it is announcing has been sung.
 */
const FADE_MS = 220;

export function ReadAlongLine({
  gurmukhi,
  translation,
  lit,
  onLayout,
}: {
  gurmukhi: string;
  translation?: string;
  lit: boolean;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  // A derived value rather than an effect: the fade is driven from the UI
  // thread, so a 10Hz position update never touches React.
  const progress = useDerivedValue(() => withTiming(lit ? 1 : 0, { duration: FADE_MS }));

  const animated = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [colors.mutedForeground, colors.primary]),
  }));

  return (
    <View className="py-2" onLayout={onLayout}>
      <Animated.Text style={animated} className="font-gurbani text-[21px] leading-8">
        {gurmukhi}
      </Animated.Text>
      {translation ? (
        <Text
          className={
            lit
              ? 'pt-0.5 text-[13px] leading-[18px] text-foreground'
              : 'pt-0.5 text-[13px] leading-[18px] text-subtle-foreground'
          }
        >
          {translation}
        </Text>
      ) : null}
    </View>
  );
}
