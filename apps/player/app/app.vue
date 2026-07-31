<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue';
import { Home, Users, Disc3, Radio, Heart } from 'lucide-vue-next';
import { usePlayer } from '~/composables/usePlayer';

const player = usePlayer();
const audioEl = useTemplateRef<HTMLAudioElement>('audioEl');

// One <audio> element for the whole app so playback survives navigation — a
// shabad keeps playing while the listener browses, which is the single thing
// that separates a music app from a page with an audio tag on it.
onMounted(() => {
  if (audioEl.value) player.attach(audioEl.value);
});

const nav = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/artists', label: 'Artists', icon: Users },
  { to: '/puratan', label: 'Puratan', icon: Disc3 },
  { to: '/live', label: 'Live', icon: Radio },
  { to: '/favorites', label: 'Favorites', icon: Heart },
];
</script>

<template>
  <div class="flex h-dvh flex-col bg-black text-neutral-200">
    <div class="flex min-h-0 flex-1 gap-2 p-2">
      <aside class="hidden w-60 shrink-0 flex-col gap-2 md:flex">
        <div class="rounded-lg bg-neutral-900 p-4">
          <NuxtLink to="/" class="flex items-center gap-2.5">
            <img src="/brand/logo-badge.svg" alt="" class="size-8 rounded-lg" />
            <span class="text-sm font-semibold text-neutral-100">Kirtan</span>
          </NuxtLink>
        </div>
        <nav class="flex-1 rounded-lg bg-neutral-900 p-2">
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-neutral-400 transition hover:text-neutral-100"
            active-class="!text-neutral-100 bg-neutral-800"
          >
            <component :is="item.icon" class="size-[18px]" />
            {{ item.label }}
          </NuxtLink>
        </nav>
      </aside>

      <main
        class="min-w-0 flex-1 overflow-y-auto rounded-lg bg-gradient-to-b from-neutral-900 to-neutral-950"
      >
        <div class="mx-auto max-w-6xl px-4 py-6 pb-10 md:px-6">
          <NuxtPage />
        </div>
      </main>
    </div>

    <!-- Streams straight from sgpc.net: it honours Range requests and is
         Cloudflare-cached, so nothing is proxied and bandwidth costs us nil. -->
    <audio
      ref="audioEl"
      preload="metadata"
      @timeupdate="player.onTimeUpdate"
      @loadedmetadata="player.onLoadedMetadata"
      @ended="player.next"
    />

    <!-- Always mounted, like every music app: the transport never disappears,
         it just sits idle until something is picked. -->
    <PlayerBar />
    <MobileTabBar />
  </div>
</template>
