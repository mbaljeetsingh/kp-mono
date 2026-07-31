<script setup lang="ts">
import { Radio } from 'lucide-vue-next';
import { usePlayer } from '~/composables/usePlayer';
const player = usePlayer();

// Unlike the archive, the live stream sends `Access-Control-Allow-Origin: *`,
// so it needs no proxy. Single 28 kbps AAC feed — the old 92/32/16 tiers were
// retired with the previous site.
const LIVE = {
  id: 'live',
  title: 'Live from Sri Harmandir Sahib',
  subtitle: 'Amritsar · 28 kbps AAC+',
  url: 'https://live.sgpc.net:8442/',
};
const isLive = computed(
  () => player.current.value?.id === 'live' && player.playing.value
);
</script>

<template>
  <div class="grid place-items-center py-20 text-center">
    <div class="grid size-24 place-items-center rounded-full bg-amber-500/10">
      <Radio
        class="size-10 text-amber-400"
        :class="isLive && 'animate-pulse'"
      />
    </div>
    <h1 class="mt-6 text-2xl font-semibold text-neutral-100">Live Kirtan</h1>
    <p class="mt-1 text-sm text-neutral-500">
      Streaming now from Sri Harmandir Sahib, Amritsar
    </p>
    <button
      class="mt-7 rounded-full bg-neutral-100 px-8 py-3 text-sm font-semibold text-neutral-900 transition hover:scale-105"
      @click="isLive ? player.toggle() : player.play(LIVE)"
    >
      {{ isLive ? 'Pause' : 'Listen live' }}
    </button>
  </div>
</template>
