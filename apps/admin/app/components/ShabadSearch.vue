<script setup lang="ts">
import { Search, X } from 'lucide-vue-next';

const emit = defineEmits<{
  select: [{ shabadId: number; firstLine: string; raag?: string }];
}>();

const q = ref('');
const debounced = refDebounced(q, 300);
const loading = ref(false);
const results = ref<any[]>([]);

// BaniDB's search is first-letter based on Gurmukhi, so "mbj" finds
// "Mith Bolraa Jee" — that's the convention every Sikh app uses and what a
// tagger will already know. Typing the romanized line in full finds nothing,
// which is why the hint below spells the convention out.
// BaniDB's search modes. First-letter Gurmukhi is the default because it is
// how kirtan is actually looked up — you hear a line, you type its initials.
// The Gurmukhi modes expect the ASCII font encoding BaniDB uses, so a tagger
// typing with a Gurmukhi keyboard uses those; English searches the translation.
const MODES = [
  { key: 1, label: 'First letters', hint: 'mbj → Mith Bolraa Jee' },
  { key: 2, label: 'Gurmukhi word', hint: 'type a full word in Gurmukhi' },
  { key: 4, label: 'English', hint: 'search the English translation' },
  { key: 6, label: 'Ang', hint: 'jump by page number' },
] as const;
const mode = useLocalStorage<number>('kp:shabad-search-mode', 1);

watch([debounced, mode], async () => {
  const term = debounced.value.trim();
  if (term.length < 2) {
    results.value = [];
    return;
  }
  loading.value = true;
  try {
    const res = await fetch(
      `https://api.banidb.com/v2/search/${encodeURIComponent(term)}?searchtype=${mode.value}`
    );
    const json = await res.json();
    results.value = (json.verses ?? []).slice(0, 12);
  } catch {
    results.value = [];
  } finally {
    loading.value = false;
  }
});

function choose(v: any) {
  emit('select', {
    shabadId: v.shabadId,
    // The transliteration is what a tagger can actually read back to check the
    // match; the Gurmukhi field is in an ASCII font encoding, not Unicode.
    firstLine: v.transliteration?.english ?? v.verse?.gurmukhi ?? '',
    raag: v.raag?.english ?? undefined,
  });
  q.value = '';
  results.value = [];
}
</script>

<template>
  <div>
    <div class="mb-2 flex gap-1">
      <button
        v-for="m in MODES"
        :key="m.key"
        class="rounded px-2 py-1 text-[11px] transition"
        :class="
          mode === m.key
            ? 'bg-accent text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="mode = m.key"
      >
        {{ m.label }}
      </button>
      <span class="ml-auto self-center text-[11px] text-muted-foreground">
        {{ MODES.find((m) => m.key === mode)?.hint }}
      </span>
    </div>

    <div class="relative">
      <Search
        class="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        v-model="q"
        placeholder="Link a shabad from BaniDB…"
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
      class="mt-2 max-h-64 overflow-y-auto rounded-md border border-border"
    >
      <li v-for="v in results" :key="v.verseId">
        <button
          class="w-full border-b border-border px-3 py-2 text-left transition last:border-0 hover:bg-accent"
          @click="choose(v)"
        >
          <span class="block truncate text-sm">
            {{ v.transliteration?.english ?? v.verse?.gurmukhi }}
          </span>
          <span class="block truncate text-[11px] text-muted-foreground">
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
