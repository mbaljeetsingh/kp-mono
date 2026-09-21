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

/**
 * Tolerates both encodings this key has been written in.
 *
 * The Nuxt app stored it with `setItem(THEME_KEY, choice)` — a bare `dark` —
 * and usehooks-ts JSON.parses what it reads, so every returning listener who
 * had ever touched the toggle got `SyntaxError: Unexpected token 'd'` and
 * silently fell back to System. Same key, different encoding: the rewrite kept
 * the name and changed the format underneath it.
 *
 * Never throws — a deserializer that does would take the whole hook with it.
 * An unrecognised value resolves to System, which is also the sane default for
 * anything a future version writes here.
 */
function readThemeChoice(raw: string): ThemeChoice {
  let value: unknown = raw;
  if (raw.startsWith('"')) {
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw;
    }
  }
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function useTheme() {
  // usehooks-ts already swallows the throw from a blocked storage adapter and
  // syncs across tabs, which is the whole reason not to hand-roll this.
  const [choice, setChoice] = useLocalStorage<ThemeChoice>(THEME_KEY, 'system', {
    deserializer: readThemeChoice,
  });

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
