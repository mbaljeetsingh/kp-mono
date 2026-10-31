/**
 * How the read-along is set: transliteration, Larivaar and text size.
 *
 * The phone's version of the web's menu, as a sheet like LanguageSelector's. It
 * stays open on a choice so the lines above it can be compared, which is why
 * its backdrop is lighter than that sheet's.
 */
import { READ_ALONG_TEXT_SIZES, type ReadAlongOptions, type ReadAlongTextSize } from '@kp/core';
import { Switch } from '@kp/ui-native/switch';
import { SlidersHorizontal, Type, X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { useColors } from '~/lib/theme';

const TEXT_SIZE_ICON: Record<ReadAlongTextSize, number> = { small: 14, medium: 18, large: 24 };

function Row({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      className="flex-row items-center justify-between gap-3 px-4 py-3 active:bg-accent"
    >
      <Text className="text-foreground">{label}</Text>
      <Switch checked={on} onCheckedChange={onPress} />
    </Pressable>
  );
}

export function ReadAlongOptionsSheet({
  options,
  onChange,
}: {
  options: ReadAlongOptions;
  onChange: (next: ReadAlongOptions) => void;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Read-along options"
        className="size-10 items-center justify-center rounded-xl bg-card active:bg-accent"
      >
        <SlidersHorizontal size={18} color={colors.mutedForeground} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/20" onPress={() => setOpen(false)}>
          {/* Stops a tap inside the sheet from dismissing it. */}
          <Pressable className="rounded-t-2xl bg-popover pb-8 pt-2" onPress={() => {}}>
            <View className="flex-row items-center justify-between px-4 pb-2">
              <Text className="font-display-medium text-lg text-foreground">Read along</Text>
              <Pressable
                onPress={() => setOpen(false)}
                accessibilityLabel="Close"
                className="size-9 items-center justify-center"
              >
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <Row
              label="Transliteration"
              on={options.transliteration}
              onPress={() => onChange({ ...options, transliteration: !options.transliteration })}
            />
            <Row
              label="Larivaar"
              on={options.larivaar}
              onPress={() => onChange({ ...options, larivaar: !options.larivaar })}
            />
            <View className="flex-row gap-2 px-4 pt-2">
              {READ_ALONG_TEXT_SIZES.map(({ value, label }) => (
                <Pressable
                  key={value}
                  onPress={() => onChange({ ...options, textSize: value })}
                  accessibilityRole="button"
                  accessibilityLabel={`${label} text`}
                  accessibilityState={{ selected: options.textSize === value }}
                  className={
                    options.textSize === value
                      ? 'h-11 flex-1 items-center justify-center rounded-xl bg-accent'
                      : 'h-11 flex-1 items-center justify-center rounded-xl active:bg-accent'
                  }
                >
                  <Type size={TEXT_SIZE_ICON[value]} color={colors.foreground} />
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
