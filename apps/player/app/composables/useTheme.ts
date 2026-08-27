/**
 * Light or dark, or whatever the device says.
 *
 * `shared-theme/theme.css` has carried both palettes from the start — the
 * parchment set on `:root` and the lamp-lit set on `.dark` — and the app simply
 * pinned `class="dark"` on <html> and never offered the other one. This is the
 * switch; the tokens needed nothing.
 *
 * Module-level ref, like `usePlayer` and `useAuth`: one document, one theme, so
 * every component reads the same value without a store or a provide.
 */
import { computed, ref, watch } from 'vue';
import { Sun, Moon, Monitor, type LucideIcon } from 'lucide-vue-next';

export type ThemeChoice = 'system' | 'light' | 'dark';

/**
 * The three choices, in the order they are always offered.
 *
 * Shared rather than declared per-component: the sidebar toggle and the phone's
 * More sheet both name these, and a label that drifts between the two surfaces
 * is the kind of thing nobody notices until it is wrong in a screenshot.
 */
export const THEME_OPTIONS: {
  value: ThemeChoice;
  label: string;
  icon: LucideIcon;
}[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/** Read by the pre-paint script in `app.vue` as well, which cannot import. */
export const THEME_KEY = 'kp:theme';

const choice = ref<ThemeChoice>('system');

/**
 * What the device asks for, tracked live: someone who has never touched the
 * toggle should follow their phone into dark mode at sunset without reloading.
 * Null until the client says otherwise — the server has no media queries, and
 * guessing dark there is what the pre-paint script exists to avoid.
 */
const systemDark = ref<boolean | null>(null);

/** Dark or not, once the choice and the device have both been consulted. */
const resolved = computed(() =>
  choice.value === 'system'
    ? (systemDark.value ?? true)
    : choice.value === 'dark'
);

function apply(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
}

/**
 * Started once, from `app.vue`'s `onMounted`. Never in setup: this reads
 * localStorage and matchMedia, neither of which exists on the server.
 */
export function initTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      choice.value = saved;
    }
  } catch {
    // Private mode, or storage disabled. The default stands.
  }

  const query = window.matchMedia('(prefers-color-scheme: dark)');
  systemDark.value = query.matches;
  query.addEventListener('change', (e) => {
    systemDark.value = e.matches;
  });

  // The pre-paint script has already put the right class on <html>, so this
  // only matters from the first change onwards — but it is also the one place
  // the class is written, which keeps the two from disagreeing.
  watch(
    resolved,
    (dark) => apply(dark),
    // `flush: 'sync'` so a tap on the toggle repaints in the same frame rather
    // than a tick later, which on a phone reads as the tap having missed.
    { immediate: true, flush: 'sync' }
  );
}

export function useTheme() {
  function set(next: ThemeChoice) {
    choice.value = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Nothing to do: the theme still applies for this session.
    }
  }

  return { choice, resolved, set };
}
