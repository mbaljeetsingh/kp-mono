/**
 * The header of the four tabs: the same controls in the same place, so language
 * is there on Search, where it decides what is typed, and sign-in is no longer
 * found only by opening Library. Pages behind a tab keep their way back instead.
 */
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AccountButton } from '~/components/AccountSheet';
import { LanguageSelector } from '~/components/LanguageSelector';
import { LogoBadge } from '~/components/LogoBadge';

export function AppHeader() {
  const router = useRouter();
  return (
    <View className="flex-row items-center gap-2">
      {/* The mark goes home, as a site's logo does. The group is named because
          every tab holds its own copy of the index route: a bare '/' resolves
          inside the current tab, which would open Home's page under Search. */}
      <Pressable
        onPress={() => router.navigate('/(tabs)/(home)')}
        accessibilityRole="link"
        accessibilityLabel="Home"
        hitSlop={8}
      >
        <LogoBadge size={32} />
      </Pressable>
      <View className="flex-1" />
      <LanguageSelector />
      <AccountButton />
    </View>
  );
}
