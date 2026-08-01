<script setup lang="ts">
import { X, BookOpen } from 'lucide-vue-next';
import { usePlayer } from '~/composables/usePlayer';

const player = usePlayer();
const { shabad, loading, load } = useShabadText();
const open = defineModel<boolean>('open', { default: false });

// Only tagged segments carry a shabad id — most will not, for a long time.
const shabadId = computed(() => player.current.value?.shabadId ?? null);
const mainVerseId = computed(() => player.current.value?.mainVerseId ?? null);

watch([open, shabadId], () => {
  if (open.value) void load(shabadId.value);
});

const lines = computed(() => shabad.value?.verses ?? []);

// Which shabad this is — writer, raag and ang. It comes back on the same
// fetch as the verses, and without it the panel shows Gurbani without saying
// what was linked, which is the one thing a listener would check it against.
const info = computed(() => {
  const i = shabad.value?.shabadInfo;
  if (!i) return '';
  return [
    i.writer?.english,
    i.raag?.english,
    i.pageNo ? `Ang ${i.pageNo}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
});

// A shabad runs well past the height of this panel, so the anchor line is
// usually below the fold on open. Scroll to it rather than making the reader
// hunt for the one line the rendition is actually known by.
const anchorEl = ref<HTMLElement | null>(null);

watch([lines, open], async () => {
  if (!open.value || mainVerseId.value == null) return;
  // The cached path fills `lines` on a microtask, so wait for the render that
  // creates the element before reaching for it.
  await nextTick();
  anchorEl.value?.scrollIntoView({ block: 'center' });
});
</script>

<template>
  <aside
    v-if="open"
    class="absolute right-4 bottom-full left-4 mb-2 max-h-[28rem] overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl md:left-auto md:w-96"
  >
    <div
      class="sticky top-0 flex items-start justify-between gap-2 border-b border-neutral-800 bg-neutral-900 px-4 py-3"
    >
      <div class="min-w-0">
        <p
          class="flex items-center gap-2 text-sm font-semibold text-neutral-100"
        >
          <BookOpen class="size-4 shrink-0" /> Shabad
        </p>
        <p v-if="info" class="truncate text-xs text-neutral-500">{{ info }}</p>
      </div>
      <button
        class="shrink-0 text-neutral-500 hover:text-neutral-200"
        @click="open = false"
      >
        <X class="size-4" />
      </button>
    </div>

    <div class="px-4 py-3">
      <p v-if="loading" class="py-8 text-center text-xs text-neutral-500">
        Loading…
      </p>
      <template v-else>
        <!-- The anchor is marked the same way the tagger saw it in admin — a
             warm wash and a rule down the side — so the line they pinned is
             the line a listener sees highlighted. -->
        <p
          v-for="v in lines"
          :key="v.verseId"
          :ref="
            (el) => {
              if (v.verseId === mainVerseId) anchorEl = el as HTMLElement;
            }
          "
          class="border-b border-neutral-800/60 py-2 last:border-0"
          :class="
            v.verseId === mainVerseId &&
            '-mx-2 rounded-r border-l-2 border-l-amber-400 bg-amber-500/10 px-2'
          "
        >
          <span
            class="block text-[15px] leading-relaxed"
            :class="
              v.verseId === mainVerseId ? 'text-amber-300' : 'text-neutral-100'
            "
          >
            {{ v.verse?.unicode ?? v.verse?.gurmukhi }}
          </span>
          <span
            class="mt-0.5 block text-xs"
            :class="
              v.verseId === mainVerseId
                ? 'text-amber-400/70'
                : 'text-neutral-500'
            "
          >
            {{ v.transliteration?.english }}
          </span>
          <span
            v-if="v.translation?.en?.bdb"
            class="mt-0.5 block text-xs text-neutral-400"
          >
            {{ v.translation.en.bdb }}
          </span>
        </p>
      </template>
    </div>
  </aside>
</template>
