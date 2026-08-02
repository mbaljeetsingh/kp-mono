<script setup lang="ts">
import { Search, X } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Input } from '@/components/ui/input';
import { SELECTED_SEGMENT } from '@/lib/segmented';
import { toGurmukhiLetters } from '~/composables/useGurmukhi';
import { prettyShabadName } from '~/composables/useShabadName';

const emit = defineEmits<{
  select: [{ shabadId: number; verseId: number | null; firstLine: string }];
}>();

// searchtype 0 is BaniDB's first-letter search and accepts both Gurmukhi and
// the roman keys that map onto it; 7 searches the English translation and
// returns nothing for Gurmukhi input. Punjabi is the default because that is
// how kirtan is looked up — you hear a line and type its initials.
const LANGS = [
  { key: 0, label: 'Punjabi' },
  { key: 7, label: 'English' },
] as const;

// Same-origin proxy in dev — see nuxt.config routeRules.
const base = useRuntimeConfig().public.banidbApiBaseUrl;

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
      `${base}/search/${encodeURIComponent(term)}?searchtype=${lang.value}`
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

function choose(v: any) {
  // The line the tagger searched for and clicked is a stronger signal than any
  // heuristic — they were looking for that line. It becomes the anchor, and
  // any other line is one click away in the display below.
  emit('select', {
    shabadId: v.shabadId,
    verseId: typeof v.verseId === 'number' ? v.verseId : null,
    firstLine: prettyShabadName(v.transliteration?.english ?? ''),
  });
  q.value = '';
  results.value = [];
}

const gurmukhi = (v: any) => v.verse?.unicode ?? v.verse?.gurmukhi ?? '';
</script>

<template>
  <div>
    <ButtonGroup class="mb-2" aria-label="Search language">
      <Button
        v-for="l in LANGS"
        :key="l.key"
        size="sm"
        variant="outline"
        :aria-pressed="lang === l.key"
        :class="['px-2 text-[11px]', SELECTED_SEGMENT]"
        @click="lang = l.key"
      >
        {{ l.label }}
      </Button>
    </ButtonGroup>

    <div class="relative">
      <Search
        class="pointer-events-none absolute top-1/2 left-3 z-10 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        :model-value="q"
        placeholder="Search a shabad"
        class="bg-card py-2 pr-8 pl-9 text-[15px]"
        @input="onInput"
      />
      <Button
        v-if="q"
        variant="ghost"
        size="icon-sm"
        class="absolute top-1/2 right-1 size-7 -translate-y-1/2 text-muted-foreground"
        @click="((q = ''), (results = []))"
      >
        <X class="size-3.5" />
      </Button>
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
