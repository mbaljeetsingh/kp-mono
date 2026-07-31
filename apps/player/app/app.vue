<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue';
import { usePlayer, formatTime } from '~/composables/usePlayer';

const player = usePlayer();
const audioEl = useTemplateRef<HTMLAudioElement>('audioEl');

// One <audio> element for the whole app, mounted here so playback survives
// navigation — a track keeps playing while the listener browses.
onMounted(() => {
  if (audioEl.value) player.attach(audioEl.value);
});

function scrub(event: Event) {
  const pct = Number((event.target as HTMLInputElement).value);
  const start = player.current.value?.startSec ?? 0;
  const end = player.current.value?.endSec ?? player.duration.value;
  player.seek(start + ((end - start) * pct) / 100);
}
</script>

<template>
  <div class="min-h-screen bg-neutral-950 text-neutral-100">
    <header class="border-b border-neutral-800 sticky top-0 bg-neutral-950/90 backdrop-blur z-10">
      <nav class="mx-auto max-w-5xl flex gap-6 px-4 py-3 text-sm">
        <NuxtLink to="/" class="font-semibold">Kirtan</NuxtLink>
        <NuxtLink to="/artists" class="text-neutral-400 hover:text-neutral-100">Artists</NuxtLink>
        <NuxtLink to="/puratan" class="text-neutral-400 hover:text-neutral-100">Puratan</NuxtLink>
        <NuxtLink to="/live" class="text-neutral-400 hover:text-neutral-100">Live</NuxtLink>
      </nav>
    </header>

    <!-- Bottom padding clears the player bar so the last row is never hidden. -->
    <main class="mx-auto max-w-5xl px-4 py-6 pb-28">
      <NuxtPage />
    </main>

    <!-- Audio streams straight from sgpc.net: it serves Range requests and is
         Cloudflare-cached, so nothing is proxied and our bandwidth cost is nil. -->
    <audio
      ref="audioEl"
      preload="metadata"
      @timeupdate="player.onTimeUpdate"
      @loadedmetadata="player.onLoadedMetadata"
      @ended="player.playing.value = false"
    />

    <div
      v-if="player.current.value"
      class="fixed bottom-0 inset-x-0 border-t border-neutral-800 bg-neutral-900"
    >
      <div class="mx-auto max-w-5xl px-4 py-3 flex items-center gap-4">
        <button
          class="size-10 shrink-0 rounded-full bg-neutral-100 text-neutral-900 text-lg"
          @click="player.toggle"
        >
          {{ player.playing.value ? '‖' : '▶' }}
        </button>

        <div class="min-w-0 flex-1">
          <p class="truncate text-sm">{{ player.current.value.title }}</p>
          <p class="truncate text-xs text-neutral-400">{{ player.current.value.subtitle }}</p>
          <div class="mt-1 flex items-center gap-2">
            <span class="text-[11px] tabular-nums text-neutral-500">
              {{ formatTime(player.currentTime.value) }}
            </span>
            <input
              type="range" min="0" max="100" step="0.1"
              :value="player.progress.value"
              class="flex-1 accent-neutral-100"
              @input="scrub"
            >
            <span class="text-[11px] tabular-nums text-neutral-500">
              {{ formatTime(player.duration.value) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
