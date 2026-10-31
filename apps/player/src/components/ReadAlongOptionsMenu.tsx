/**
 * How the read-along is set: transliteration, Larivaar and text size.
 *
 * A menu that stays open, because the point of each choice is to see what it
 * does to the lines behind it, and closing on every tap makes comparing them a
 * chore.
 */
import { READ_ALONG_TEXT_SIZES, type ReadAlongTextSize } from '@kp/core';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kp/ui/dropdown-menu';
import { Switch } from '@kp/ui/switch';
import { SlidersHorizontal, Type } from 'lucide-react';

import { useReadAlongOptions } from '~/lib/read-along-options';
import { cn } from '~/lib/utils';

// `!`: the menu item sizes any icon inside it to 1rem.
const TEXT_SIZE_ICON: Record<ReadAlongTextSize, string> = {
  small: 'size-3!',
  medium: 'size-4!',
  large: 'size-5!',
};

/**
 * The whole row is the target, so the switch only shows the state: a second
 * handler on it would toggle twice, and a second tab stop would sit inside a
 * menu item.
 */
function SwitchItem({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <DropdownMenuItem
      closeOnClick={false}
      role="menuitemcheckbox"
      aria-checked={on}
      onClick={onToggle}
      className="justify-between gap-4"
    >
      {label}
      <Switch checked={on} tabIndex={-1} aria-hidden className="pointer-events-none" />
    </DropdownMenuItem>
  );
}

export function ReadAlongOptionsMenu({ className }: { className?: string }) {
  const [options, onChange] = useReadAlongOptions();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Read-along options"
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground',
          className
        )}
      >
        <SlidersHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <SwitchItem
          label="Transliteration"
          on={options.transliteration}
          onToggle={() => onChange({ ...options, transliteration: !options.transliteration })}
        />
        <SwitchItem
          label="Larivaar"
          on={options.larivaar}
          onToggle={() => onChange({ ...options, larivaar: !options.larivaar })}
        />
        <DropdownMenuSeparator />
        <div className="flex items-center gap-1 p-1">
          {READ_ALONG_TEXT_SIZES.map(({ value, label }) => (
            <DropdownMenuItem
              key={value}
              closeOnClick={false}
              aria-label={`${label} text`}
              onClick={() => onChange({ ...options, textSize: value })}
              className={cn(
                'h-9 flex-1 justify-center',
                options.textSize === value && 'bg-accent text-accent-foreground'
              )}
            >
              <Type className={TEXT_SIZE_ICON[value]} />
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
