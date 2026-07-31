<script setup lang="ts">
import { Search, X } from 'lucide-vue-next';

const emit = defineEmits<{
  select: [{ shabadId: number; firstLine: string }];
}>();

// BaniDB's first-letter search. searchtype 0 accepts both Gurmukhi ("ਮਬਜ") and
// its roman equivalent ("mbj") and is what np-mono uses for Punjabi; 7 is
// English-only and returns nothing for Gurmukhi input. Punjabi is the default
// because that is how kirtan is looked up — you hear a line, you type its
// initials.
const LANGS = [
  { key: 0, label: 'Punjabi', hint: 'ਮਬਜ or mbj → Mith Bolraa Jee' },
  { key: 7, label: 'English', hint: 'search the translation' },
] as const;

const lang = useLocalStorage<number>('kp:shabad-lang', 0);
const q = ref('');
const debounced = refDebounced(q, 300);
const loading = ref(false);
const results = ref<any[]>([]);

// Requests are not cancelled, so a slow earlier one can resolve after a newer
// one. Commit a result only if its term is still the current one.
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

function choose(v: any) {
  emit('select', {
    shabadId: v.shabadId,
    // The transliteration is what a tagger can read back to check the match —
    // the gurmukhi field is in an ASCII font encoding, not Unicode.
    firstLine: v.transliteration?.english ?? v.verse?.gurmukhi ?? '',
  });
  q.value = '';
  results.value = [];
}
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
      <span class="ml-auto text-[11px] text-muted-foreground">
        {{ LANGS.find((l) => l.key === lang)?.hint }}
      </span>
    </div>

    <div class="relative">
      <Search
        class="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        v-model="q"
        placeholder="First letters of the line…"
        class="w-full rounded-md border border-input bg-card py-2 pr-8 pl-9 text-sm outline-none focus:border-ring"
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
      class="mt-2 max-h-56 overflow-y-auto rounded-md border border-border"
    >
      <li v-for="v in results" :key="v.verseId">
        <button
          class="w-full border-b border-border px-3 py-2 text-left last:border-0 hover:bg-accent"
          @click="choose(v)"
        >
          <span class="block truncate text-sm">
            {{ v.transliteration?.english ?? v.verse?.gurmukhi }}
          </span>
          <span class="block truncate text-[11px] text-muted-foreground">
            {{
              [v.writer?.english, v.pageNo ? `Ang ${v.pageNo}` : null]
                .filter(Boolean)
                .join(' · ')
            }}
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>
