/**
 * Light, dark, or whatever the phone says — the phone's version of the web's
 * ThemeToggle, with the same three options in the same order.
 *
 * Three rather than a switch: "System" is a real preference, and a toggle that
 * silently pins one of the two takes it away from anyone who had it.
 * A sheet, as LanguageSelector is, because that is how this app offers choices.
 * Opened from a row in the account sheet, not the header: it is set once, where
 * language changes what is on screen and earns its place there.
 */
import { Check, ChevronRight, Moon, Smartphone, Sun, X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { useColors, useThemeChoice, type ThemeChoice } from '~/lib/theme';

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Smartphone },
];

export function ThemeSelector() {
  const colors = useColors();
  const [choice, setChoice] = useThemeChoice();
  const [open, setOpen] = useState(false);
  const current = OPTIONS.find((option) => option.value === choice)?.label;

  function choose(next: ThemeChoice) {
    setOpen(false);
    if (next !== choice) setChoice(next);
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Theme: ${current}`}
        className="flex-row items-center gap-2 px-4 py-3 active:bg-accent"
      >
        <Text className="flex-1 text-foreground">Theme</Text>
        <Text className="text-muted-foreground">{current}</Text>
        <ChevronRight size={16} color={colors.mutedForeground} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setOpen(false)}>
          {/* Stops a tap inside the sheet from dismissing it. */}
          <Pressable className="rounded-t-2xl bg-popover pb-8 pt-2" onPress={() => {}}>
            <View className="flex-row items-center gap-2 px-4 pb-2">
              <Text className="flex-1 font-display-medium text-lg text-foreground">Theme</Text>
              <Pressable
                onPress={() => setOpen(false)}
                accessibilityLabel="Close"
                className="size-9 items-center justify-center"
              >
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            {OPTIONS.map(({ value, label, icon: OptionIcon }) => (
              <Pressable
                key={value}
                onPress={() => choose(value)}
                accessibilityRole="button"
                accessibilityState={{ selected: choice === value }}
                className="flex-row items-center gap-3 px-4 py-3 active:bg-accent"
              >
                <OptionIcon size={18} color={colors.mutedForeground} />
                <Text className="flex-1 text-foreground">{label}</Text>
                {choice === value ? <Check size={18} color={colors.primary} /> : null}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
