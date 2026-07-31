<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue';
import { Home, Users, Disc3, Radio, Heart } from 'lucide-vue-next';
import { usePlayer } from '~/composables/usePlayer';

const player = usePlayer();
const audioEl = useTemplateRef<HTMLAudioElement>('audioEl');

// One <audio> element for the whole app so playback survives navigation — a
// shabad keeps playing while the listener browses, which is the single thing
// separating a music app from a page with an audio tag on it.
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
  <!-- One continuous surface. Earlier this was three floating panels with gaps
       between them, which read as separate widgets rather than one app; the
       regions are now separated by hairlines on a single background. -->
  <div class="flex h-dvh flex-col bg-neutral-950 text-neutral-300">
    <div class="flex min-h-0 flex-1">
      <aside
        class="hidden w-56 shrink-0 flex-col border-r border-neutral-800/80 md:flex"
      >
        <NuxtLink to="/" class="flex items-center gap-2.5 px-5 py-4">
          <img src="/brand/logo-badge.svg" alt="" class="size-7 rounded-md" />
          <span class="text-[15px] font-semibold text-neutral-100">Kirtan</span>
        </NuxtLink>

        <nav class="flex-1 px-2">
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="relative flex items-center gap-3 rounded-md px-3 py-2 text-sm text-neutral-400 transition hover:text-neutral-100"
            active-class="!text-neutral-100"
          >
            <component :is="item.icon" class="size-[18px]" />
            {{ item.label }}
          </NuxtLink>
        </nav>
      </aside>

      <main class="min-w-0 flex-1 overflow-y-auto">
        <div class="mx-auto max-w-5xl px-5 py-7 pb-10 md:px-8">
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

    <PlayerBar />
    <MobileTabBar />
  </div>
</template>
