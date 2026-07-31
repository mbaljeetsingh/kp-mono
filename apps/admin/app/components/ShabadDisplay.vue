<script setup lang="ts">
import { X, Pin } from 'lucide-vue-next';
import { prettyShabadName } from '~/composables/useShabadName';

const props = defineProps<{ shabadId: number }>();
const mainVerseId = defineModel<number | null>('mainVerseId', {
  default: null,
});
const emit = defineEmits<{
  clear: [];
  /** On load — fills the name only when it is still empty. */
  firstLine: [string];
  /** On a deliberate verse click — replaces the name outright. */
  renamed: [string];
}>();

const verses = ref<any[]>([]);
const loading = ref(false);
const info = ref<any>(null);

const RAHAO = /ਰਹਾਉ|रहाउ|rahaau/i;

/** The rahao is the refrain a ragi returns to, and is what a listener
 *  recognises a rendition by — a better default anchor than the opening line,
 *  which may never be sung prominently. */
function findRahao(list: any[]): number | null {
  for (const v of list) {
    const text = [
      v.verse?.unicode,
      v.verse?.gurmukhi,
      ...Object.values(v.transliteration ?? {}),
    ].filter((x) => typeof x === 'string') as string[];
    if (text.some((t) => RAHAO.test(t))) return v.verseId;
  }
  return list[0]?.verseId ?? null;
}

watch(
  () => props.shabadId,
  async (id) => {
    if (!id) return;
    loading.value = true;
    try {
      const res = await fetch(`https://api.banidb.com/v2/shabads/${id}`);
      const json = await res.json();
      verses.value = json.verses ?? [];
      info.value = json.shabadInfo ?? null;
      // Suggest, don't impose — the tagger can click any line to change it.
      if (mainVerseId.value == null)
        mainVerseId.value = findRahao(verses.value);
      const anchor = verses.value.find((v) => v.verseId === mainVerseId.value);
      if (anchor?.transliteration?.english) {
        emit('firstLine', prettyShabadName(anchor.transliteration.english));
      }
    } catch {
      verses.value = [];
    } finally {
      loading.value = false;
    }
  },
  { immediate: true }
);

function setMain(v: any) {
  mainVerseId.value = v.verseId;
  // Picking a different anchor is a deliberate statement about which line this
  // rendition is known by, so the name follows it — unlike the initial rahao
  // guess, which must not overwrite something the tagger already typed.
  if (v.transliteration?.english) {
    emit('renamed', prettyShabadName(v.transliteration.english));
  }
}

const gurmukhi = (v: any) => v.verse?.unicode ?? v.verse?.gurmukhi ?? '';
</script>

<template>
  <div class="rounded-lg border border-border">
    <div
      class="flex items-start justify-between gap-2 border-b border-border px-3 py-2"
    >
      <div class="min-w-0">
        <p class="text-xs font-medium">Shabad #{{ props.shabadId }}</p>
        <p v-if="info" class="truncate text-[11px] text-muted-foreground">
          {{
            [
              info.writer?.english,
              info.raag?.english,
              info.pageNo ? `Ang ${info.pageNo}` : null,
            ]
              .filter(Boolean)
              .join(' · ')
          }}
        </p>
      </div>
      <button
        class="shrink-0 text-muted-foreground hover:text-foreground"
        title="Unlink"
        @click="emit('clear')"
      >
        <X class="size-3.5" />
      </button>
    </div>

    <p v-if="loading" class="py-8 text-center text-xs text-muted-foreground">
      Loading…
    </p>

    <p
      v-else
      class="border-b border-border bg-accent/40 px-3 py-1.5 text-[11px] text-muted-foreground"
    >
      Click a line to set it as the main verse — the line this rendition is
      known by.
    </p>

    <div v-else class="max-h-80 overflow-y-auto">
      <!-- Any line can be the anchor; clicking swaps it, so a wrong guess is
           one click to fix rather than a re-link. -->
      <button
        v-for="v in verses"
        :key="v.verseId"
        class="flex w-full items-start gap-2 border-b border-border/60 px-3 py-2 text-left last:border-0 hover:bg-accent"
        :class="v.verseId === mainVerseId && 'bg-amber-500/10'"
        :title="v.verseId === mainVerseId ? 'Main verse' : 'Set as main verse'"
        @click="setMain(v)"
      >
        <Pin
          class="mt-1 size-3 shrink-0"
          :class="
            v.verseId === mainVerseId ? 'text-amber-400' : 'text-transparent'
          "
        />
        <span class="min-w-0">
          <span
            class="block text-[15px] leading-relaxed"
            :class="
              v.verseId === mainVerseId ? 'text-amber-300' : 'text-foreground'
            "
          >
            {{ gurmukhi(v) }}
          </span>
          <span class="block text-[11px] text-muted-foreground">{{
            v.transliteration?.english
          }}</span>
        </span>
      </button>
    </div>

    <p
      class="border-t border-border px-3 py-2 text-[11px] text-muted-foreground"
    >
      Click any line to make it the main verse — the one this rendition is known
      by.
    </p>
  </div>
</template>
