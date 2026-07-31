<script setup lang="ts">
import { Search, X } from 'lucide-vue-next';
import { toGurmukhiLetters } from '~/composables/useGurmukhi';

const emit = defineEmits<{
  select: [{ shabadId: number; firstLine: string }];
}>();

// searchtype 0 is BaniDB's first-letter search and accepts both Gurmukhi and
// the roman keys that map onto it; 7 searches the English translation and
// returns nothing for Gurmukhi input. Punjabi is the default because that is
// how kirtan is looked up — you hear a line and type its initials.
const LANGS = [
  { key: 0, label: 'Punjabi' },
  { key: 7, label: 'English' },
] as const;

const lang = useLocalStorage<number>('kp:shabad-lang', 0);
const q = ref('');
const debounced = refDebounced(q, 300);
const loading = ref(false);
const results = ref<any[]>([]);

/**
 * Convert keystrokes to Gurmukhi in the field itself, the way np-mono's
 * virtual keyboard does — typing "qmp" leaves ਤਮਪ in the input rather than
 * roman letters the tagger has to trust blindly.
 *
 * Safe to convert in place because BaniDB's first-letter search accepts both
 * forms: "mbj" and "ਮਬਜ" return the same results. The mapping is 1:1 per
 * character, so backspace and selection behave normally.
 */
function onInput(event: Event) {
  const el = event.target as HTMLInputElement;
  if (lang.value !== 0) {
    q.value = el.value;
    return;
  }
  const caret = el.selectionStart ?? el.value.length;
  const converted = toGurmukhiLetters(el.value);
  q.value = converted;
  // Vue rewrites the value on the next tick; restore the caret so typing in
  // the middle of a query does not jump to the end.
  nextTick(() => el.setSelectionRange(caret, caret));
}

let generation = 0;

watch([debounced, lang], async () => {
  const term = debounced.value.trim();
  const mine = ++generation;
  if (term.length < 2) {
    results.value = [];
    return;
  }
  loading.value = true;
  try {
    const res = await fetch(
      `https://api.banidb.com/v2/search/${encodeURIComponent(term)}?searchtype=${lang.value}`
    );
    const json = await res.json();
    if (mine !== generation) return;
    results.value = (json.verses ?? []).slice(0, 12);
  } catch {
    if (mine === generation) results.value = [];
  } finally {
    if (mine === generation) loading.value = false;
  }
});

const gurmukhi = (v: any) => v.verse?.unicode ?? v.verse?.gurmukhi ?? '';
</script>

<template>
  <div>
    <div class="mb-2 flex items-center gap-1">
      <button
        v-for="l in LANGS"
        :key="l.key"
        class="rounded px-2 py-1 text-[11px] transition"
        :class="
          lang === l.key
            ? 'bg-accent text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="lang = l.key"
      >
        {{ l.label }}
      </button>
      <span v-if="echo" class="ml-auto text-sm text-amber-400">{{ echo }}</span>
    </div>

    <div class="relative">
      <Search
        class="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        :value="q"
        placeholder="Search a shabad"
        class="w-full rounded-md border border-input bg-card py-2 pr-8 pl-9 text-[15px] outline-none focus:border-ring"
        @input="onInput"
      />
      <button
        v-if="q"
        class="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        @click="((q = ''), (results = []))"
      >
        <X class="size-3.5" />
      </button>
    </div>

    <p v-if="loading" class="mt-2 text-xs text-muted-foreground">Searching…</p>

    <ul
      v-if="results.length"
      class="mt-2 max-h-60 overflow-y-auto rounded-md border border-border"
    >
      <li v-for="v in results" :key="v.verseId">
        <button
          class="w-full border-b border-border px-3 py-2 text-left last:border-0 hover:bg-accent"
          @click="choose(v)"
        >
          <span
            class="block truncate text-[15px] leading-relaxed text-foreground"
          >
            {{ gurmukhi(v) }}
          </span>
          <span class="block truncate text-xs text-muted-foreground">
            {{ v.transliteration?.english }}
          </span>
          <span class="block truncate text-[11px] text-muted-foreground/70">
            {{
              [
                v.writer?.english,
                v.raag?.english,
                v.pageNo ? `Ang ${v.pageNo}` : null,
              ]
                .filter(Boolean)
                .join(' · ')
            }}
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>
