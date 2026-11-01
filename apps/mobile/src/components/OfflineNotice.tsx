/**
 * What a screen shows instead of itself with no connection: Home and Radio are
 * nothing but things to fetch, so greying them out control by control would only
 * leave a page of dead buttons. The one thing that still works is a tap away.
 */
import { useRouter } from 'expo-router';
import { WifiOff } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Screen } from '~/components/Screen';
import { recheckNetwork } from '~/lib/network';
import { useColors } from '~/lib/theme';

export function OfflineNotice() {
  const colors = useColors();
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  function retry() {
    setChecking(true);
    void recheckNetwork().finally(() => setChecking(false));
  }

  return (
    <Screen offlineBanner={false} className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <WifiOff size={32} color={colors.mutedForeground} />
        <Text className="font-display text-[22px] leading-7 text-foreground">You’re offline</Text>
        <Text className="text-center text-[15px] leading-5 text-muted-foreground">
          Your downloads still play.
        </Text>
        <View className="mt-3 w-full max-w-xs gap-2">
          <Pressable
            onPress={() => router.navigate('/saved')}
            className="items-center rounded-xl bg-primary py-3 active:opacity-90"
          >
            <Text className="font-medium text-primary-foreground">Go to downloads</Text>
          </Pressable>
          <Pressable
            onPress={retry}
            disabled={checking}
            className="items-center rounded-xl bg-secondary py-3 active:bg-accent"
          >
            <Text className="font-medium text-foreground">
              {checking ? 'Checking…' : 'Try again'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
