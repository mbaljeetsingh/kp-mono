<script setup lang="ts">
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ListMusic,
  BookOpen,
  X,
} from 'lucide-vue-next';
import { usePlayer, formatTime } from '~/composables/usePlayer';
import { artworkFor } from '~/composables/useArtwork';

const player = usePlayer();
const showQueue = ref(false);
const showLyrics = ref(false);

// Read-along belongs on the transport, not on a page: you are listening when
// you want it, and it should follow whatever is playing.
const hasShabad = computed(() => player.current.value?.shabadId != null);

const art = computed(() =>
  artworkFor(
    player.current.value?.subtitle ?? player.current.value?.title ?? 'kirtan'
  )
);

function scrub(event: Event) {
  const pct = Number((event.target as HTMLInputElement).value);
  const start = player.current.value?.startSec ?? 0;
  const end = player.current.value?.endSec ?? player.duration.value;
  player.seek(start + ((end - start) * pct) / 100);
}

// Elapsed within the shabad, not within the file it sits inside — a segment
// starting at 42:10 of a set should read 0:00, not 42:10.
const elapsed = computed(() =>
  Math.max(0, player.currentTime.value - (player.current.value?.startSec ?? 0))
);
const total = computed(() => {
  const c = player.current.value;
  if (c?.endSec != null && c.startSec != null) return c.endSec - c.startSec;
  return player.duration.value;
});
</script>

<template>
  <div class="relative">
    <LyricsPanel v-model:open="showLyrics" />

    <!-- Up next slides over the content rather than pushing it, so the queue
         can be checked without losing your place in a list. -->
    <Transition
      enter-active-class="transition duration-200"
      leave-active-class="transition duration-150"
      enter-from-class="translate-y-4 opacity-0"
      leave-to-class="translate-y-4 opacity-0"
    >
      <aside
        v-if="showQueue"
        class="absolute right-4 bottom-full mb-2 max-h-96 w-80 overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-900 p-3 shadow-2xl"
      >
        <div class="mb-2 flex items-center justify-between">
          <p class="text-sm font-semibold text-neutral-100">Up next</p>
          <button
            class="text-neutral-500 hover:text-neutral-200"
            @click="showQueue = false"
          >
            <X class="size-4" />
          </button>
        </div>
        <p
          v-if="!player.upNext.value.length"
          class="py-6 text-center text-xs text-neutral-600"
        >
          Nothing queued.
        </p>
        <button
          v-for="item in player.upNext.value"
          :key="item.id"
          class="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left hover:bg-white/5"
          @click="player.playFromQueue(item.id)"
        >
          <ArtTile
            :name="item.artist ?? item.title"
            :photo="item.artistPhoto"
            class="size-8 shrink-0 text-[9px]"
          />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-xs text-neutral-200">{{
              item.title
            }}</span>
            <span class="block truncate text-[11px] text-neutral-500">{{
              item.subtitle
            }}</span>
          </span>
        </button>
      </aside>
    </Transition>

    <footer
      class="border-t border-neutral-800/80 bg-neutral-950 px-4 py-2.5 md:py-3"
    >
      <div class="mx-auto flex max-w-7xl items-center gap-3 md:gap-4">
        <div class="flex min-w-0 flex-1 items-center gap-3">
          <ArtTile
            v-if="player.current.value"
            :name="player.current.value.artist ?? player.current.value.title"
            :photo="player.current.value.artistPhoto"
            class="size-11 shrink-0 text-[11px] md:size-12"
          />
          <div
            v-else
            class="grid size-11 shrink-0 place-items-center rounded text-[11px] font-semibold text-white/80 md:size-12"
            :style="art.style"
          >
            ♪
          </div>
          <div class="min-w-0">
            <p class="truncate text-sm text-neutral-100">
              {{ player.current.value?.title ?? 'Nothing playing' }}
            </p>
            <p class="truncate text-xs text-neutral-500">
              <NuxtLink
                v-if="player.current.value?.artist"
                :to="`/ragis/${encodeURIComponent(player.current.value.artist)}`"
                class="hover:text-neutral-200 hover:underline"
                >{{ player.current.value.subtitle }}</NuxtLink
              >
              <template v-else>{{
                player.current.value?.subtitle ?? 'Pick a shabad to start'
              }}</template>
            </p>
          </div>
        </div>

        <div class="flex flex-[2] flex-col items-center gap-1.5">
          <div class="flex items-center gap-4">
            <button
              class="text-neutral-400 transition hover:text-neutral-100 disabled:opacity-30"
              :disabled="!player.current.value"
              @click="player.previous"
            >
              <SkipBack class="size-4 fill-current" />
            </button>
            <button
              class="grid size-9 place-items-center rounded-full bg-neutral-100 text-neutral-900 transition hover:scale-105 disabled:opacity-30"
              :disabled="!player.current.value"
              @click="player.toggle"
            >
              <Pause v-if="player.playing.value" class="size-4 fill-current" />
              <Play v-else class="size-4 translate-x-px fill-current" />
            </button>
            <button
              class="text-neutral-400 transition hover:text-neutral-100 disabled:opacity-30"
              :disabled="!player.upNext.value.length"
              @click="player.next"
            >
              <SkipForward class="size-4 fill-current" />
            </button>
          </div>
          <div class="hidden w-full items-center gap-2 md:flex">
            <span
              class="w-10 text-right text-[11px] tabular-nums text-neutral-500"
            >
              {{ formatTime(elapsed) }}
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              :value="player.progress.value"
              :disabled="!player.current.value"
              class="h-1 flex-1 accent-neutral-100"
              @input="scrub"
            />
            <span class="w-10 text-[11px] tabular-nums text-neutral-500">
              {{ formatTime(total) }}
            </span>
          </div>
        </div>

        <div class="flex flex-1 items-center justify-end gap-3">
          <!-- Only rendered when the segment carries a BaniDB shabad id. Most
               will not for a long time, and a permanently dimmed control the
               listener cannot act on is noise rather than information. -->
          <button
            v-if="hasShabad"
            class="hidden text-neutral-400 transition hover:text-neutral-100 md:block"
            :class="showLyrics && '!text-amber-400'"
            title="Read along"
            @click="((showLyrics = !showLyrics), (showQueue = false))"
          >
            <BookOpen class="size-4" />
          </button>
          <button
            class="hidden text-neutral-400 transition hover:text-neutral-100 md:block"
            :class="showQueue && '!text-amber-400'"
            @click="((showQueue = !showQueue), (showLyrics = false))"
          >
            <ListMusic class="size-4" />
          </button>
        </div>
      </div>

      <!-- Mobile keeps a hairline progress bar instead of the full scrubber. -->
      <div class="mt-2 h-0.5 w-full rounded bg-neutral-800 md:hidden">
        <div
          class="h-full rounded bg-neutral-300"
          :style="{ width: `${player.progress.value}%` }"
        />
      </div>
    </footer>
  </div>
</template>
