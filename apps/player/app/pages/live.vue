<script setup lang="ts">
import { usePlayer } from '~/composables/usePlayer';
const player = usePlayer();

// Unlike the archive, the live stream sends `Access-Control-Allow-Origin: *`,
// so it needs no proxy at all. Single 28 kbps AAC feed — the old 92/32/16
// tiers were retired along with the previous site.
const LIVE = {
  id: 'live',
  title: 'Live from Sri Harmandir Sahib',
  subtitle: '28 kbps · AAC+',
  url: 'https://live.sgpc.net:8442/',
};
</script>

<template>
  <div class="py-10 text-center">
    <h1 class="text-lg">Live Kirtan</h1>
    <p class="mt-1 text-sm text-neutral-500">Direct from Sri Harmandir Sahib, Amritsar</p>
    <button
      class="mt-6 rounded-full bg-neutral-100 px-6 py-2.5 text-sm font-medium text-neutral-900"
      @click="player.play(LIVE)"
    >
      {{ player.current.value?.id === 'live' && player.playing.value ? 'Playing' : 'Listen live' }}
    </button>
  </div>
</template>
