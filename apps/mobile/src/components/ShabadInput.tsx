/**
 * The field a shabad is searched from, and the keys that type into it in Punjabi.
 *
 * In Punjabi the phone's keyboard stays down and the Gurmukhi letters take its
 * place, so nobody has to know that ਤ lives on `q`. They insert the GurbaniLipi
 * keys BaniDB's first-letter search wants, the same ones as the web's popover
 * and np-mono's keyboard. English keeps the phone's keyboard. The keys are their
 * own component because where they sit is the screen's to decide.
 */
import { GURMUKHI_BACKSPACE, GURMUKHI_KEYS } from '@kp/api';
import type { TitleScript } from '@kp/core';
import { Delete, Search } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { Input } from '@kp/ui-native/input';

import { cn } from '~/lib/utils';
import { useColors } from '~/lib/theme';

const ROW_LENGTH = 10;
const HALF_ROW = ROW_LENGTH / 2;
const ROWS = Array.from({ length: GURMUKHI_KEYS.length / ROW_LENGTH }, (_, row) =>
  GURMUKHI_KEYS.slice(row * ROW_LENGTH, (row + 1) * ROW_LENGTH)
);

export function ShabadInput({
  value,
  onChangeText,
  script,
  placeholder,
  autoFocus,
  onPress,
}: {
  value: string;
  onChangeText: (next: string) => void;
  script: TitleScript;
  placeholder: string;
  autoFocus?: boolean;
  onPress?: () => void;
}) {
  const colors = useColors();
  const punjabi = script === 'pa';

  return (
    <View className="justify-center">
      <View pointerEvents="none" className="absolute left-3 z-10">
        <Search size={16} color={colors.mutedForeground} />
      </View>
      <Input
        value={value}
        onChangeText={onChangeText}
        autoFocus={autoFocus}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        autoCorrect={false}
        // A shabad name is not a sentence, and iOS would shift the first
        // letter of every new query.
        autoCapitalize="none"
        returnKeyType="search"
        showSoftInputOnFocus={!punjabi}
        onPressIn={onPress}
        // Only once there is something to draw in it: React Native draws the
        // placeholder in the field's font, and GurbaniLipi would garble it.
        className={cn(
          'h-11 pl-9',
          punjabi && 'py-0',
          // Each centred by eye: the system Gurmukhi of the placeholder and
          // the GurbaniLipi of the text sit differently on one line height.
          punjabi && (value.length > 0 ? 'font-gurmukhi text-lg leading-7' : 'leading-[18px]')
        )}
      />
    </View>
  );
}

export function GurmukhiKeys({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (next: string) => void;
}) {
  const colors = useColors();

  return (
    <View className="gap-1">
      {ROWS.map((row, rowIndex) => (
        <View key={rowIndex} className="flex-row gap-1">
          {row.map((key, keyIndex) =>
            key ? (
              <Pressable
                key={keyIndex}
                onPress={() =>
                  onChangeText(key === GURMUKHI_BACKSPACE ? value.slice(0, -1) : value + key)
                }
                accessibilityRole="button"
                accessibilityLabel={key === GURMUKHI_BACKSPACE ? 'Backspace' : `Type ${key}`}
                // Two shades split each row in half, as np-mono's keyboard does, so a
                // key is found by which side it is on rather than read across ten.
                className={cn(
                  'h-11 flex-1 items-center justify-center rounded-md active:bg-accent',
                  keyIndex < HALF_ROW ? 'bg-primary-soft' : 'bg-muted'
                )}
              >
                {key === GURMUKHI_BACKSPACE ? (
                  <Delete size={18} color={colors.foreground} />
                ) : (
                  <Text className="font-gurmukhi text-lg text-foreground">{key}</Text>
                )}
              </Pressable>
            ) : (
              // A spacer, not a key: it keeps the short row's letters in line.
              <View key={keyIndex} className="flex-1" />
            )
          )}
        </View>
      ))}
    </View>
  );
}
