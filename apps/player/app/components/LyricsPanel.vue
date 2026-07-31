<script setup lang="ts">
import { X, BookOpen } from 'lucide-vue-next';
import { usePlayer } from '~/composables/usePlayer';

const player = usePlayer();
const { shabad, loading, load } = useShabadText();
const open = defineModel<boolean>('open', { default: false });

// Only tagged segments carry a shabad id — most will not, for a long time.
const shabadId = computed(() => player.current.value?.shabadId ?? null);

watch([open, shabadId], () => {
  if (open.value) void load(shabadId.value);
});

const lines = computed(() => shabad.value?.verses ?? []);
</script>

<template>
  <aside
    v-if="open"
    class="absolute right-4 bottom-full mb-2 max-h-[28rem] w-96 overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl"
  >
    <div
      class="sticky top-0 flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4 py-3"
    >
      <p class="flex items-center gap-2 text-sm font-semibold text-neutral-100">
        <BookOpen class="size-4" /> Shabad
      </p>
      <button
        class="text-neutral-500 hover:text-neutral-200"
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
        <p
          v-for="v in lines"
          :key="v.verseId"
          class="border-b border-neutral-800/60 py-2 last:border-0"
          :class="
            v.verseId === player.current.value?.mainVerseId && 'text-amber-400'
          "
        >
          <span class="block text-[15px] leading-relaxed text-neutral-100">
            {{ v.verse?.unicode ?? v.verse?.gurmukhi }}
          </span>
          <span class="mt-0.5 block text-xs text-neutral-500">
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
