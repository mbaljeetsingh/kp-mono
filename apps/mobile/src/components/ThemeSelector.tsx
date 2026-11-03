/**
 * Light, dark, or whatever the phone says — the phone's version of the web's
 * ThemeToggle, with the same three options in the same order.
 *
 * Three rather than a switch: "System" is a real preference, and a toggle that
 * silently pins one of the two takes it away from anyone who had it.
 * All three in a row inside the account sheet, rather than a row that opened a
 * second sheet over the first: three short words fit, the current one is seen
 * without a tap, and a sheet on a sheet was two dismissals to change one thing.
 */
import { Moon, Smartphone, Sun } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { useColors, useThemeChoice, type ThemeChoice } from '~/lib/theme';

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Smartphone },
];

export function ThemeSelector() {
  const colors = useColors();
  const [choice, setChoice] = useThemeChoice();

  return (
    <View className="gap-2 px-4 py-2">
      <Text className="text-sm text-subtle-foreground">Theme</Text>
      <View accessibilityRole="radiogroup" className="flex-row gap-1 rounded-xl bg-secondary p-1">
        {OPTIONS.map(({ value, label, icon: OptionIcon }) => {
          const selected = choice === value;
          return (
            <Pressable
              key={value}
              onPress={() => {
                if (!selected) setChoice(value);
              }}
              accessibilityRole="radio"
              accessibilityLabel={`Theme: ${label}`}
              // `checked`, not `selected`: a radio announces only the former.
              accessibilityState={{ checked: selected }}
              // 44pt, the smallest a thumb reliably hits.
              className={`min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-lg ${
                selected ? 'bg-background' : 'active:bg-accent'
              }`}
            >
              <OptionIcon size={14} color={selected ? colors.foreground : colors.mutedForeground} />
              <Text className={selected ? 'text-foreground' : 'text-muted-foreground'}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
