/**
 * The header of the four tabs: the same controls in the same place, so language
 * is there on Search, where it decides what is typed, and sign-in is no longer
 * found only by opening Library. Pages behind a tab keep their way back instead.
 */
import { View } from 'react-native';

import { AccountButton } from '~/components/AccountSheet';
import { LanguageSelector } from '~/components/LanguageSelector';
import { LogoBadge } from '~/components/LogoBadge';
import { ThemeSelector } from '~/components/ThemeSelector';

export function AppHeader() {
  return (
    <View className="flex-row items-center gap-2">
      <LogoBadge size={32} />
      <View className="flex-1" />
      <LanguageSelector />
      <ThemeSelector />
      <AccountButton />
    </View>
  );
}
