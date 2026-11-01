/**
 * One line of the read-along, lighting and dimming as the singing moves.
 *
 * The same lit line as the web player: a gold edge, a wash fading to the right
 * and a heavier face, on text that is otherwise the verse colour.
 *
 * The only animation in the app that carries meaning rather than polish. The
 * highlight used to switch instantly, which on a sparse alignment reads as a
 * glitch: a line snaps on, and a few seconds later another one does, with
 * nothing connecting them. A short fade makes the two read as one movement —
 * the same reason karaoke wipes rather than cuts.
 *
 * The edge and the wash sit in one layer behind the text, and only its opacity
 * moves: React Native cannot transition a gradient, and this way lighting a
 * line never shifts the text beside it.
 */
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useDerivedValue, withTiming } from 'react-native-reanimated';
import type { ReadAlongTextSize, VerseSegment } from '@kp/core';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { useColors } from '~/lib/theme';

const LINE_SIZE: Record<ReadAlongTextSize, string> = {
  small: 'text-[18px] leading-7',
  medium: 'text-[21px] leading-8',
  large: 'text-[26px] leading-10',
};

/**
 * Long enough to read as a fade, short enough that it has finished before the
 * line it is announcing has been sung.
 */
const FADE_MS = 220;

export function ReadAlongLine({
  segments,
  transliteration,
  translation,
  textSize,
  lit,
  onLayout,
}: {
  segments: VerseSegment[];
  transliteration?: string;
  translation?: string;
  textSize: ReadAlongTextSize;
  lit: boolean;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const colors = useColors();
  // A derived value rather than an effect: the fade is driven from the UI
  // thread, so a 10Hz position update never touches React.
  const progress = useDerivedValue(() => withTiming(lit ? 1 : 0, { duration: FADE_MS }));

  const litLayer = useAnimatedStyle(() => ({ opacity: progress.value }));

  // verse-translation is 3.8:1 on the lit line's wash.
  const secondary = lit ? 'text-muted-foreground' : 'text-verse-translation';

  return (
    <View className="py-1.5 pl-3.5 pr-3" onLayout={onLayout}>
      <Animated.View
        pointerEvents="none"
        style={litLayer}
        className="absolute inset-0 overflow-hidden rounded-r-md border-l-2 border-highlight"
      >
        <LinearGradient
          colors={[colors.verseActiveFrom, colors.verseActiveTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
      <Text
        className={`${lit ? 'font-gurbani-semibold' : 'font-gurbani'} text-verse ${LINE_SIZE[textSize]}`}
      >
        {segments.map((segment, index) => (
          <Text key={index} className={segment.accent ? 'text-highlight' : undefined}>
            {segment.text}
          </Text>
        ))}
      </Text>
      {transliteration ? (
        <Text className={`pt-0.5 text-[13px] italic leading-[18px] ${secondary}`}>
          {transliteration}
        </Text>
      ) : null}
      {translation ? (
        <Text className={`pt-0.5 text-[13px] leading-[18px] ${secondary}`}>{translation}</Text>
      ) : null}
    </View>
  );
}
