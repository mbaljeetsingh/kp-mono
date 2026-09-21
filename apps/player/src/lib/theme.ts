/**
 * Light or dark, or whatever the device says.
 *
 * The token file has carried both palettes from the start — the parchment set
 * on `:root` and the lamp-lit set on `.dark` — and the app simply pinned
 * `class="dark"` on <html> and never offered the other one. This is the switch;
 * the tokens needed nothing.
 */
import { useEffect } from 'react';
import { useLocalStorage, useMediaQuery } from 'usehooks-ts';

export type ThemeChoice = 'system' | 'light' | 'dark';

/** Read by the pre-paint script in index.html too, which cannot import. */
export const THEME_KEY = 'kp:theme';

export function useTheme() {
  // usehooks-ts already swallows the throw from a blocked storage adapter and
  // syncs across tabs, which is the whole reason not to hand-roll this.
  const [choice, setChoice] = useLocalStorage<ThemeChoice>(THEME_KEY, 'system');

  // Someone who has never touched the toggle should follow their phone into
  // dark mode at sunset without reloading.
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');

  const resolved = choice === 'system' ? systemDark : choice === 'dark';

  // The pre-paint script has already put the right class on <html>, so this
  // only matters from the first change onwards — but it is also the one place
  // the class is written, which keeps the two from disagreeing.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved);
  }, [resolved]);

  return { choice, resolved, set: setChoice };
}
