/**
 * Light, dark, or whatever the device says.
 *
 * Three options rather than a two-state switch: "system" is a real preference,
 * and a toggle that silently pins one of the two takes it away from anyone who
 * had it.
 */
import { Button } from '@kp/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@kp/ui/dropdown-menu';
import { Monitor, Moon, Sun } from 'lucide-react';

import { useTheme, type ThemeChoice } from '~/lib/theme';

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function ThemeToggle() {
  const { choice, resolved, set } = useTheme();
  const Icon = choice === 'system' ? Monitor : resolved ? Moon : Sun;

  return (
    <DropdownMenu>
      {/* Base UI composes through `render`, not Radix's `asChild`. */}
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label={`Theme: ${choice}`} />}
      >
        <Icon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map(({ value, label, icon: OptionIcon }) => (
          <DropdownMenuItem key={value} onSelect={() => set(value)}>
            <OptionIcon />
            {label}
            {choice === value ? <span className="ml-auto text-primary">•</span> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
