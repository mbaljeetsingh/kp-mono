/**
 * A Pressable that answers the finger.
 *
 * The app had no motion at all: rows changed background colour on press and
 * nothing else moved, which is the single clearest tell that a screen is drawn
 * by React rather than by the system. Every native list dips slightly under a
 * finger and springs back, and the absence reads as unresponsiveness even when
 * the tap registers instantly.
 *
 * A spring rather than a timing curve, because the return is the part you feel
 * — a linear release looks mechanical at this scale. The numbers are small on
 * purpose: this should be noticed only if it stops happening.
 */
import { forwardRef } from 'react';
import { Pressable, type PressableProps, type View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type WithSpringConfig,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Firm and short. A bouncier spring reads as a toy on a list of prayers. */
const SPRING: WithSpringConfig = { damping: 18, stiffness: 320, mass: 0.6 };

interface Props extends PressableProps {
  /** How far down it goes. A whole row moves less than a small button. */
  scaleTo?: number;
  className?: string;
}

export const PressableScale = forwardRef<View, Props>(function PressableScale(
  { scaleTo = 0.97, onPressIn, onPressOut, style, ...props },
  ref
) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      ref={ref}
      onPressIn={(e) => {
        scale.value = withSpring(scaleTo, SPRING);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, SPRING);
        onPressOut?.(e);
      }}
      style={[animated, style]}
      {...props}
    />
  );
});
