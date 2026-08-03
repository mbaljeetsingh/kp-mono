<script setup lang="ts">
import { Search, X } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Input } from '@/components/ui/input';
import { SELECTED_SEGMENT } from '@/lib/segmented';
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
 * Typing is GurbaniLipi, the way np-mono's shabad search is.
 *
 * The field keeps the tagger's raw keystrokes and renders them in the
 * GurbaniLipi font, so `mdmA` shows as ਮਦਮਅ while the query still holds the
 * ASCII BaniDB's first-letter search wants. There is no transliteration step,
 * which is the point: nothing can disagree about what was typed, the caret
 * never jumps, and paste, backspace and selection all behave like a normal
 * input because it is one.
 *
 * English search is a different alphabet, so it drops the font and reads as
 * roman.
 */
const gurbaniLipi = computed(() => lang.value === 0);

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
        v-model="q"
        placeholder="Search a shabad"
        class="bg-card py-2 pr-16 pl-9"
        :class="gurbaniLipi ? 'font-gurmukhi text-xl' : 'text-[15px]'"
      />
      <div class="absolute top-1/2 right-1 flex -translate-y-1/2 items-center">
        <Button
          v-if="q"
          variant="ghost"
          size="icon-sm"
          class="size-7 text-muted-foreground"
          aria-label="Clear the search"
          @click="((q = ''), (results = []))"
        >
          <X class="size-3.5" />
        </Button>
        <GurmukhiKeyboard v-if="gurbaniLipi" v-model="q" />
      </div>
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
