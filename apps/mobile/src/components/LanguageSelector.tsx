/**
 * The language titles are shown in — the phone's version of the web's
 * selector (and np-mono's): the current language named in its own script, and
 * the choices in a sheet, each in its own script, the current one checked.
 * A sheet rather than a dropdown, as ShabadActions is: it is how this app
 * offers choices, and a thumb reaches the bottom of the screen. Switching
 * mid-shabad also retitles the lock screen.
 */
import type { TitleScript } from '@kp/core';
import { colors } from '@kp/tokens/colors';
import { Check, ChevronDown, Languages, X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { playerActions } from '~/lib/player';
import { useTitleScript } from '~/lib/title-script';

/** In np-mono's order, each named in its own script. */
const LANGUAGES: { value: TitleScript; label: string; short: string; gurmukhi?: boolean }[] = [
  { value: 'pa', label: 'ਪੰਜਾਬੀ', short: 'ਪੰ', gurmukhi: true },
  { value: 'en', label: 'English', short: 'En' },
];

export function LanguageSelector() {
  const [script, setScript] = useTitleScript();
  const [open, setOpen] = useState(false);
  const current = LANGUAGES.find((l) => l.value === script) ?? LANGUAGES[1]!;

  function choose(next: TitleScript) {
    setOpen(false);
    if (next === script) return;
    setScript(next);
    playerActions.retitle();
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Titles in ${current.label}`}
        hitSlop={6}
        className="flex-row items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 active:bg-accent"
      >
        <Text
          accessibilityLanguage={current.gurmukhi ? 'pa' : undefined}
          className={
            current.gurmukhi
              ? 'font-gurbani text-[15px] text-foreground'
              : 'text-sm font-medium text-foreground'
          }
        >
          {current.short}
        </Text>
        <ChevronDown size={12} color={colors.mutedForeground} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setOpen(false)}>
          {/* Stops a tap inside the sheet from dismissing it. */}
          <Pressable className="rounded-t-2xl bg-popover pb-8 pt-2" onPress={() => {}}>
            <View className="flex-row items-center gap-2 px-4 pb-2">
              <Languages size={16} color={colors.mutedForeground} />
              <Text className="flex-1 font-display-medium text-lg text-foreground">
                Show titles in
              </Text>
              <Pressable
                onPress={() => setOpen(false)}
                accessibilityLabel="Close"
                className="size-9 items-center justify-center"
              >
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            {LANGUAGES.map(({ value, label, gurmukhi }) => (
              <Pressable
                key={value}
                onPress={() => choose(value)}
                accessibilityRole="button"
                accessibilityState={{ selected: script === value }}
                className="flex-row items-center gap-3 px-4 py-3 active:bg-accent"
              >
                <View className="size-5 items-center justify-center">
                  {script === value ? <Check size={18} color={colors.primary} /> : null}
                </View>
                <Text
                  accessibilityLanguage={gurmukhi ? 'pa' : undefined}
                  className={
                    gurmukhi ? 'font-gurbani text-[17px] text-foreground' : 'text-foreground'
                  }
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
