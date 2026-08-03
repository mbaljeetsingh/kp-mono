<script setup lang="ts">
import { Search, X } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Input } from '@/components/ui/input';
import { SELECTED_SEGMENT } from '@/lib/segmented';
import { useIndicTransliterate } from '~/composables/useIndicTransliterate';
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
 * Typing works the way np-mono's lyrics input does: roman keys stay roman in
 * the field, and the word being typed gets phonetic Gurmukhi suggestions —
 * pick one and it replaces the word. The old per-key AnmolLipi echo made `a`
 * and `A` mean different letters than anywhere else the tagger types
 * Gurmukhi; it is gone, and nothing is lost, because BaniDB's first-letter
 * search accepts the raw roman keys ("dppp" and "ਦਪਪਪ" return the same
 * results). Ignore the suggestions entirely and first-letter search behaves
 * exactly as before.
 */
const translit = useIndicTransliterate();

function onInput(event: Event) {
  q.value = (event.target as HTMLInputElement).value;
}

// The word under construction — the last whitespace-separated token. Only it
// gets suggestions; committed Gurmukhi words to its left are left alone.
const currentWord = computed(() => {
  if (lang.value !== 0) return '';
  const parts = q.value.split(/\s+/);
  return parts[parts.length - 1] ?? '';
});
const debouncedWord = refDebounced(currentWord, 200);
watch(debouncedWord, (w) => {
  if (w && /[a-zA-Z]/.test(w)) void translit.fetchSuggestions(w);
  else translit.clear();
});

/** Replace the in-progress roman word with the chosen Gurmukhi one. */
function acceptSuggestion(word: string) {
  const parts = q.value.split(/(\s+)/);
  parts[parts.length - 1] = word;
  q.value = parts.join('') + ' ';
  translit.clear();
}

// Tab = take the first suggestion, the muscle memory np-mono trains.
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab' && translit.suggestions.value.length) {
    e.preventDefault();
    acceptSuggestion(translit.suggestions.value[0]!);
  } else if (e.key === 'Escape') {
    translit.clear();
  }
}

// Vowel signs only occur in real words, never in a first-letter query — so
// their presence is what routes between BaniDB's two search modes.
const MATRA = /[ਾਿੀੁੂੇੈੋੌੰਂੱ੍]/;

let generation = 0;

watch([debounced, lang], async () => {
  const term = debounced.value.trim();
  const mine = ++generation;
  if (term.length < 2) {
    results.value = [];
    return;
  }
  // Full words (picked from suggestions, or pasted) search the actual text;
  // bare letters — roman or Gurmukhi — stay on first-letter search.
  const searchtype =
    lang.value === 0 && MATRA.test(term) ? 2 : lang.value;
  loading.value = true;
  try {
    const res = await fetch(
      `${base}/search/${encodeURIComponent(term)}?searchtype=${searchtype}`
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
  translit.clear();
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
        @keydown="onKeydown"
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

    <!-- Phonetic candidates for the word being typed. Click or Tab inserts;
         typing straight past them keeps the roman letters and first-letter
         search, so the old workflow costs nothing. -->
    <div
      v-if="translit.suggestions.value.length"
      class="mt-1.5 flex flex-wrap items-center gap-1.5"
    >
      <button
        v-for="(w, i) in translit.suggestions.value"
        :key="w"
        class="rounded-full border border-border bg-card px-2.5 py-0.5 text-[13px] hover:bg-accent"
        :class="i === 0 && 'border-primary/40'"
        :title="i === 0 ? 'Tab inserts this one' : undefined"
        @click="acceptSuggestion(w)"
      >
        {{ w }}
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
