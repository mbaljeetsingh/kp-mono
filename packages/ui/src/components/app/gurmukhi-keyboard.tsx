/**
 * The on-screen Gurmukhi keyboard.
 *
 * It inserts GurbaniLipi keys — the ASCII codes the font draws as Gurmukhi — so
 * what it appends is the same thing the physical keyboard produces and the same
 * thing BaniDB's first-letter search expects. Its job is discovery: somebody who
 * knows the line but not that ੜ lives on `V` can click it once and learn where
 * it is.
 */
import { Keyboard } from 'lucide-react';

import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '../../lib/utils';

const BACKSPACE = '⇐';

/**
 * Blanks hold the grid's shape — the rows are laid out the way the letters
 * group, so the last row is short and the gaps are part of the layout.
 */
const KEYS: string[] = [
  'a',
  'A',
  'e',
  's',
  'h',
  'q',
  'Q',
  'd',
  'D',
  'n',
  'k',
  'K',
  'g',
  'G',
  '|',
  'p',
  'P',
  'b',
  'B',
  'm',
  'c',
  'C',
  'j',
  'J',
  '\\',
  'X',
  'r',
  'l',
  'v',
  'V',
  't',
  'T',
  'f',
  'F',
  'x',
  '',
  '',
  '',
  '',
  BACKSPACE,
];

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

      <PopoverContent align="end" className="w-72 p-2">
        <div className="grid grid-cols-5 gap-1">
          {KEYS.map((key, i) =>
            key ? (
              <Button
                key={i}
                variant="secondary"
                size="sm"
                className={cn(
                  'w-full px-0',
                  key === BACKSPACE ? 'text-xs' : 'font-gurmukhi text-lg'
                )}
                aria-label={key === BACKSPACE ? 'Backspace' : `Type ${key}`}
                onClick={() => onChange(key === BACKSPACE ? value.slice(0, -1) : `${value}${key}`)}
              >
                {key}
              </Button>
            ) : (
              // A blank is a spacer, not a key: rendering it as a button would
              // give the grid five dead targets.
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
