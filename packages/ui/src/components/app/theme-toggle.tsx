/**
 * Light, dark, or whatever the device says.
 *
 * Three options rather than a two-state switch: "system" is a real preference,
 * and a toggle that silently pins one of the two takes it away from anyone who
 * had it.
 */
import { Monitor, Moon, Sun } from 'lucide-react';

import { useTheme, type ThemeChoice } from '../../lib/theme';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

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
          /* `onClick`, not Radix's `onSelect`. Base UI's Menu.Item has no
             `onSelect`, and because the underlying element is a <div> the name
             is a valid DOM prop — so it type-checked, attached as a listener
             for the text-selection event, and silently never fired. */
          <DropdownMenuItem key={value} onClick={() => set(value)}>
            <OptionIcon />
            {label}
            {choice === value ? <span className="ml-auto text-primary">•</span> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
