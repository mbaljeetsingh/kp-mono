/**
 * The field a shabad is searched from, and the keys that type into it in Punjabi.
 *
 * In Punjabi the phone's keyboard stays down and the Gurmukhi letters take its
 * place, so nobody has to know that ਤ lives on `q`. They insert the GurbaniLipi
 * keys BaniDB's first-letter search wants, the same ones as the web's popover
 * and np-mono's keyboard. English keeps the phone's keyboard. The keys are their
 * own component because where they sit is the screen's to decide.
 */
import { GURMUKHI_BACKSPACE, GURMUKHI_KEY_LETTERS, GURMUKHI_KEYS } from '@kp/api';
import type { TitleScript } from '@kp/core';
import { ChevronDown, Delete, Keyboard, Search, X } from 'lucide-react-native';
import { Platform, Pressable, Text, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { initialWindowMetrics } from 'react-native-safe-area-context';

import { Input } from '@kp/ui-native/input';

import { cn } from '~/lib/utils';
import { useSearchKeys } from '~/lib/search-keys';
import { useColors } from '~/lib/theme';

const ROW_LENGTH = 10;
const ROWS_COUNT = GURMUKHI_KEYS.length / ROW_LENGTH;
const HALF_ROW = ROW_LENGTH / 2;
const KEY_HEIGHT = 44;
const KEY_GAP = 4;
const PANEL_TOP = 8;
/** Android's tab bar, which the panel covers instead of pushing the list above. */
const ANDROID_TAB_BAR_HEIGHT = 80;
const DEVICE_BOTTOM = Math.max(initialWindowMetrics?.insets.bottom ?? 0, 8);
const PANEL_HEIGHT =
  PANEL_TOP + ROWS_COUNT * KEY_HEIGHT + (ROWS_COUNT - 1) * KEY_GAP + DEVICE_BOTTOM;

/** Room for a screen to leave under its content while the docked keys are up. */
export const DOCKED_KEYS_SPACE =
  Platform.OS === 'android' ? PANEL_HEIGHT - ANDROID_TAB_BAR_HEIGHT - DEVICE_BOTTOM : PANEL_HEIGHT;
const ROWS = Array.from({ length: ROWS_COUNT }, (_, row) =>
  GURMUKHI_KEYS.slice(row * ROW_LENGTH, (row + 1) * ROW_LENGTH)
);

export function ShabadInput({
  value,
  onChangeText,
  script,
  placeholder,
  autoFocus,
  onPress,
  onSubmit,
}: {
  value: string;
  onChangeText: (next: string) => void;
  script: TitleScript;
  placeholder: string;
  autoFocus?: boolean;
  onPress?: () => void;
  /** The phone keyboard's search key. */
  onSubmit?: () => void;
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
        onSubmitEditing={onSubmit}
        showSoftInputOnFocus={!punjabi}
        // Paste and AutoFill belong to the phone's keyboard, and it is not up.
        contextMenuHidden={punjabi}
        onPressIn={onPress}
        // Only once there is something to draw in it: React Native draws the
        // placeholder in the field's font, and GurbaniLipi would garble it.
        className={cn(
          'h-11 pl-9 pr-10',
          // Android's Gurmukhi faces carry their weight high in the line.
          punjabi && (Platform.OS === 'android' ? 'pb-0 pt-1' : 'py-0'),
          // Each centred by eye: the system Gurmukhi of the placeholder and
          // the GurbaniLipi of the text sit differently on one line height.
          punjabi &&
            (value.length > 0
              ? 'font-gurmukhi text-lg leading-7'
              : Platform.OS === 'ios' && 'leading-[18px]')
        )}
      />
      {value ? (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={6}
          className="absolute right-1 size-9 items-center justify-center"
        >
          <X size={16} color={colors.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function GurmukhiKeys({
  value,
  onChangeText,
  onHide,
}: {
  value: string;
  onChangeText: (next: string) => void;
  /** Offers a way to put the keys down, in the slot beside backspace. */
  onHide?: () => void;
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
                accessibilityLabel={
                  key === GURMUKHI_BACKSPACE ? 'Backspace' : GURMUKHI_KEY_LETTERS[key]
                }
                accessibilityLanguage={key === GURMUKHI_BACKSPACE ? undefined : 'pa'}
                // Two shades split each row in half, as np-mono's keyboard does, so a
                // key is found by which side it is on rather than read across ten.
                className={cn(
                  'h-11 flex-1 items-center justify-center rounded-md',
                  keyIndex < HALF_ROW
                    ? 'bg-accent active:bg-input'
                    : 'bg-background active:bg-accent'
                )}
              >
                {key === GURMUKHI_BACKSPACE ? (
                  <Delete size={18} color={colors.foreground} />
                ) : (
                  <Text className="font-gurmukhi text-lg text-foreground">{key}</Text>
                )}
              </Pressable>
            ) : onHide && keyIndex === ROW_LENGTH - 2 ? (
              <Pressable
                key={keyIndex}
                onPress={onHide}
                accessibilityRole="button"
                accessibilityLabel="Hide Gurmukhi keyboard"
                className="h-11 flex-1 items-center justify-center rounded-md bg-background active:bg-accent"
              >
                {/* The phone keyboard's own way down: a keyboard over an arrow. */}
                <Keyboard size={16} color={colors.foreground} />
                <ChevronDown size={12} color={colors.foreground} />
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

/**
 * Search's keys where the phone's keyboard would be, over the play controls and
 * the tabs, and without dimming: results change as you type, and one is what you
 * tap next. iOS paints native tabs over anything beside them, so there it takes
 * an overlay above the window, which passes on touches that miss the keys. That
 * overlay is above any open sheet too, so Search puts the keys down before one
 * opens. Android draws a later sibling on top.
 */
export function DockedGurmukhiKeys() {
  const term = useSearchKeys((s) => s.term);
  const setTerm = useSearchKeys((s) => s.setTerm);
  const visible = useSearchKeys((s) => s.keysOpen && s.keysAvailable);
  const setKeysOpen = useSearchKeys((s) => s.setKeysOpen);
  if (!visible) return null;

  const panel = (
    <View
      className="absolute inset-x-0 bottom-0 border-t border-border bg-popover px-2"
      style={{ paddingTop: PANEL_TOP, paddingBottom: DEVICE_BOTTOM }}
    >
      <GurmukhiKeys value={term} onChangeText={setTerm} onHide={() => setKeysOpen(false)} />
    </View>
  );
  return Platform.OS === 'ios' ? <FullWindowOverlay>{panel}</FullWindowOverlay> : panel;
}
