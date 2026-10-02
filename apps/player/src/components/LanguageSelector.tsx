/**
 * The listener's language — for now, the script shabad titles are shown in.
 *
 * The same control as np-mono's language selector: one button naming the
 * current language in its own script — two letters on a phone, the whole name
 * where there is room — and a menu of the rest, each in its own script, so a
 * listener finds the one they read without reading the others. A menu rather
 * than a pair of buttons because हिन्दी is next, and a third language should
 * be one more row, not a redesign. Switching mid-shabad also retitles what the
 * lock screen shows.
 */
import { TITLE_SCRIPTS, titleScriptOption, type TitleScript } from '@kp/core';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kp/ui/dropdown-menu';
import { Check, ChevronDown, Languages } from 'lucide-react';

import { playerActions } from '~/lib/player';
import { useTitleScript } from '~/lib/title-script';
import { cn } from '~/lib/utils';

export function LanguageSelector() {
  const [script, setScript] = useTitleScript();
  const current = titleScriptOption(script);

  function choose(next: TitleScript) {
    if (next === script) return;
    setScript(next);
    playerActions.retitle();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Language: ${current.label}`}
        className="flex shrink-0 items-center gap-1 rounded-md bg-muted/60 px-2.5 py-1.5 text-sm font-medium hover:bg-muted"
      >
        <span lang={current.lang} className={cn(current.lang === 'pa' && 'font-gurbani')}>
          <span className="md:hidden">{current.short}</span>
          <span className="hidden md:inline">{current.label}</span>
        </span>
        <ChevronDown className="size-3 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>
          <span className="flex items-center gap-1.5">
            <Languages className="size-3.5 opacity-60" />
            Language
          </span>
          {/* "Language" because the app's own words follow it later; until
              then a listener should not expect the buttons to change. */}
          <span className="mt-0.5 block whitespace-nowrap text-xs font-normal text-muted-foreground">
            Shabad titles for now
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {TITLE_SCRIPTS.map(({ value, label, lang }) => (
          /* `onClick`, not `onSelect`: see ThemeToggle — Base UI's item has
             no `onSelect`, and the DOM one never fires. */
          <DropdownMenuItem
            key={value}
            onClick={() => choose(value)}
            className={cn(script === value && 'bg-accent/50')}
          >
            <span className="w-4 shrink-0">
              {script === value ? <Check className="size-4" /> : null}
            </span>
            <span lang={lang} className={cn(lang === 'pa' && 'font-gurbani')}>
              {label}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
