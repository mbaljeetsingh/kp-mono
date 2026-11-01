/**
 * The on-screen Gurmukhi keyboard.
 *
 * It inserts GurbaniLipi keys — the ASCII codes the font draws as Gurmukhi — so
 * what it appends is the same thing the physical keyboard produces and the same
 * thing BaniDB's first-letter search expects. Its job is discovery: somebody who
 * knows the line but not that ੜ lives on `V` can click it once and learn where
 * it is.
 */
import { GURMUKHI_BACKSPACE, GURMUKHI_KEYS } from '@kp/api';
import { Keyboard } from 'lucide-react';

import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '../../lib/utils';

export function GurmukhiKeyboard({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="On-screen Gurmukhi keyboard"
            title="On-screen Gurmukhi keyboard"
          />
        }
      >
        <Keyboard />
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-2">
        <div className="grid grid-cols-10 gap-1">
          {GURMUKHI_KEYS.map((key, i) =>
            key ? (
              <Button
                key={i}
                variant="secondary"
                size="sm"
                className={cn(
                  'w-full px-0',
                  // Two shades split each row in half, as np-mono's keyboard does.
                  i % 10 < 5 && 'bg-primary-soft',
                  key === GURMUKHI_BACKSPACE ? 'text-xs' : 'font-gurmukhi text-lg'
                )}
                aria-label={key === GURMUKHI_BACKSPACE ? 'Backspace' : `Type ${key}`}
                onClick={() =>
                  onChange(key === GURMUKHI_BACKSPACE ? value.slice(0, -1) : `${value}${key}`)
                }
              >
                {key}
              </Button>
            ) : (
              // A blank is a spacer, not a key: rendering it as a button would
              // give the grid dead targets.
              <span key={i} aria-hidden />
            )
          )}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Or just type — the same keys work on your keyboard.
        </p>
      </PopoverContent>
    </Popover>
  );
}
