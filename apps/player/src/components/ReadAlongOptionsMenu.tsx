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
import { Check, SlidersHorizontal, Type } from 'lucide-react';

import { useReadAlongOptions } from '~/lib/read-along-options';
import { cn } from '~/lib/utils';

// `!`: the menu item sizes any icon inside it to 1rem.
const TEXT_SIZE_ICON: Record<ReadAlongTextSize, string> = {
  small: 'size-3!',
  medium: 'size-4!',
  large: 'size-5!',
};

function Mark({ on }: { on: boolean }) {
  return <span className="w-4 shrink-0">{on ? <Check className="size-4" /> : null}</span>;
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
        <DropdownMenuItem
          closeOnClick={false}
          onClick={() => onChange({ ...options, transliteration: !options.transliteration })}
        >
          <Mark on={options.transliteration} />
          Transliteration
        </DropdownMenuItem>
        <DropdownMenuItem
          closeOnClick={false}
          onClick={() => onChange({ ...options, larivaar: !options.larivaar })}
        >
          <Mark on={options.larivaar} />
          Larivaar
        </DropdownMenuItem>
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
