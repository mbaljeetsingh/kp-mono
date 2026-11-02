/**
 * The field a shabad is searched from, wherever it is drawn: the header's search
 * and the read-along's. One component, so the magnifier, the clear button and the
 * Gurmukhi keyboard sit in the same places in both.
 */
import { Search, X } from 'lucide-react';

import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { GurmukhiKeyboard } from './gurmukhi-keyboard';
import { cn } from '../../lib/utils';

export function ShabadInput({
  value,
  onChange,
  onSubmit,
  onClick,
  gurbaniLipi,
  placeholder,
  ariaLabel,
  autoFocus,
  className,
  inputClassName,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Enter, or the search key on a phone. */
  onSubmit?: () => void;
  onClick?: () => void;
  /** The term is GurbaniLipi keys, drawn in that font and with its keyboard to hand. */
  gurbaniLipi: boolean;
  placeholder: string;
  ariaLabel: string;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        // For Escape, and the search key on a phone. The clear button is our own.
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onClick={onClick}
        onKeyDown={(e) => {
          // Enter also accepts an input method's candidate, which submits nothing.
          // Safari can report that keydown as not composing, hence the keyCode too.
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) onSubmit?.();
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={cn(
          'pl-9 [&::-webkit-search-cancel-button]:hidden',
          gurbaniLipi ? 'pr-16' : 'pr-9',
          // Only once there is something to draw in it. The font sets the line
          // the placeholder sits on, so a smaller placeholder in another face
          // rode off centre, and GurbaniLipi would draw a hint as nonsense.
          gurbaniLipi && (value ? 'font-gurmukhi text-lg' : 'font-gurbani'),
          inputClassName
        )}
      />
      <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
        {value ? (
          <Button variant="ghost" size="icon-sm" aria-label="Clear" onClick={() => onChange('')}>
            <X />
          </Button>
        ) : null}
        {gurbaniLipi ? <GurmukhiKeyboard value={value} onChange={onChange} /> : null}
      </div>
    </div>
  );
}
