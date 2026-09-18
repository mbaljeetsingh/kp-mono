/**
 * A screen container that actually responds to its classes.
 *
 * `className` works on React Native's own components — NativeWind maps those —
 * but it silently does nothing on `SafeAreaView` from
 * react-native-safe-area-context, which is a third-party component it does not
 * map. Nothing warns: the class is accepted, dropped, and the box lays out as
 * though it were never there. That cost an afternoon on the full player, where
 * a dropped `flex-1` collapsed the read-along to zero height and put the
 * transport under the header.
 *
 * So: a plain View, which is mapped, with the insets applied as real style.
 * Same result, and `flex-1` means what it says.
 */
import { View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Edge = 'top' | 'bottom';

export function Screen({
  edges = ['top'],
  className,
  style,
  ...props
}: ViewProps & { edges?: Edge[] }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className={className}
      style={[
        {
          flex: 1,
          paddingTop: edges.includes('top') ? insets.top : 0,
          paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
        },
        style,
      ]}
      {...props}
    />
  );
}
