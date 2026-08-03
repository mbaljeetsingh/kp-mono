<script setup lang="ts">
import { X, Pin } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
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

// Same-origin proxy in dev — see nuxt.config routeRules.
const base = useRuntimeConfig().public.banidbApiBaseUrl;

const verses = ref<any[]>([]);
const loading = ref(false);
const info = ref<any>(null);

const RAHAO = /ਰਹਾਉ|रहाउ|rahaau/i;
// Raag/author captions and the invocation — printed, never sung. Word count
// alone can't tell them from short verses (a real verse can be two words),
// but a caption ALWAYS carries one of these.
const HEADING = /ਮਹਲਾ|ਮਃ|ੴ|ਰਾਗੁ|ਸਲੋਕੁ|ਪਉੜੀ|ਅਸਟਪਦੀ|ਛੰਤੁ/;

/** The rahao is the refrain a ragi returns to, and is what a listener
 *  recognises a rendition by — a better default anchor than the opening line,
 *  which may never be sung prominently.
 *
 *  The line to suggest is the one BEFORE the ਰਹਾਉ marker, not the marked line
 *  itself. Measured against real singing (issue #33): in every recording
 *  checked — four benchmark, two of ours — the ragi dwells on the couplet's
 *  first line while the marker sits on its last; as a predictor the marked
 *  line scored 18.7% frame accuracy against 43.1% for the human pick, worse
 *  than suggesting nothing. When the line before is a heading (the marker is
 *  the shabad's first sung line), there is no "before" to prefer, so the
 *  marked line keeps the suggestion. Either way the tagger can click any
 *  line; this is only the default. */
function findRahao(list: any[]): number | null {
  let prev: any = null;
  for (const v of list) {
    const text = [
      v.verse?.unicode,
      v.verse?.gurmukhi,
      ...Object.values(v.transliteration ?? {}),
    ].filter((x) => typeof x === 'string') as string[];
    if (text.some((t) => RAHAO.test(t))) {
      const prevText = prev?.verse?.unicode ?? prev?.verse?.gurmukhi ?? '';
      const prevSung = prev && prevText && !HEADING.test(prevText);
      return (prevSung ? prev : v).verseId ?? null;
    }
    prev = v;
  }
  // No marker anywhere (some shabads have none): fall back to the first SUNG
  // line — list[0] is usually the raag caption, and a hint pointing at a
  // heading helps nobody.
  const firstSung = list.find((v) => {
    const t = v.verse?.unicode ?? v.verse?.gurmukhi ?? '';
    return t && !HEADING.test(t);
  });
  return (firstSung ?? list[0])?.verseId ?? null;
}

watch(
  () => props.shabadId,
  async (id) => {
    if (!id) return;
    loading.value = true;
    try {
      const res = await fetch(`${base}/shabads/${id}`);
      const json = await res.json();
      verses.value = json.verses ?? [];
      info.value = json.shabadInfo ?? null;
      // An anchor that is not among these verses cannot be highlighted or
      // named from, so it is treated as unset rather than shown as nothing.
      const anchored = verses.value.some(
        (v) => v.verseId === mainVerseId.value
      );
      // Suggest, never store: the sung sthayi is whatever the ragi chose,
      // which only ears can know — the rahao guess missed by up to three
      // lines on real recordings (issue #33). The guess survives only as the
      // dashed hint below; main_verse_id stays empty until the tagger who
      // LISTENED clicks a line, so a wrong guess can never become data.
      if (!anchored) mainVerseId.value = null;
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

/** The likely sthayi, as a finding aid only — marked in the list, never
 *  written. Hidden as soon as a real anchor exists. */
const suggestedId = computed(() =>
  mainVerseId.value == null ? findRahao(verses.value) : null
);
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
      <Button
        variant="ghost"
        size="icon-sm"
        class="size-7 shrink-0 text-muted-foreground"
        title="Unlink"
        @click="emit('clear')"
      >
        <X class="size-3.5" />
      </Button>
    </div>

    <p v-if="loading" class="py-8 text-center text-xs text-muted-foreground">
      Loading…
    </p>

    <template v-else>
      <p
        class="border-b border-border bg-accent/40 px-3 py-1.5 text-[11px] text-muted-foreground"
      >
        Click a line to set it as the main verse — the line this rendition is
        known by.
      </p>

      <div class="max-h-80 overflow-y-auto">
        <!-- Any line can be the anchor; clicking swaps it, so a wrong guess is
           one click to fix rather than a re-link. -->
        <button
          v-for="v in verses"
          :key="v.verseId"
          class="flex w-full items-start gap-2 border-b border-border/60 px-3 py-2 text-left last:border-0 hover:bg-accent"
          :class="[
            v.verseId === mainVerseId && 'bg-amber-500/10',
            v.verseId === suggestedId &&
              'rounded outline outline-1 outline-dashed -outline-offset-1 outline-amber-400/40',
          ]"
          :title="
            v.verseId === mainVerseId
              ? 'Main verse'
              : v.verseId === suggestedId
                ? 'Likely sthayi (rahao) — click to set as main verse'
                : 'Set as main verse'
          "
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
    </template>
  </div>
</template>
