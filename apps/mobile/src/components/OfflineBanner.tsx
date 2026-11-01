/**
 * Says so when there is no connection, rather than leaving the screen to explain
 * itself with rows that do nothing.
 *
 * Inside Screen rather than once beside the navigator: react-native-screens
 * renders into native views that paint over anything JS puts next to them.
 */
import { WifiOff } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { useIsOnline } from '~/lib/network';
import { useColors } from '~/lib/theme';

export function OfflineBanner() {
  const colors = useColors();
  const online = useIsOnline();
  if (online) return null;

  return (
    <View
      accessibilityRole="alert"
      className="flex-row items-center justify-center gap-2 bg-secondary px-4 py-1.5"
    >
      <WifiOff size={14} color={colors.mutedForeground} />
      <Text className="text-[13px] text-muted-foreground">
        You’re offline. Downloads still play.
      </Text>
    </View>
  );
}
