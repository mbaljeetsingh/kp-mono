<script setup lang="ts">
import { Home, Search, Users, Radio, Heart } from 'lucide-vue-next';
import { usePlayer } from '~/composables/usePlayer';

const player = usePlayer();

// Five destinations is the ceiling for a thumb-reachable bar; anything more
// and the targets get too narrow to hit reliably.
const tabs = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/ragis', label: 'Ragis', icon: Users },
  // Lit whenever a station is playing, wherever the listener has navigated to
  // — the same signal the sidebar carries on desktop.
  { to: '/radio', label: 'Radio', icon: Radio, live: true },
  { to: '/favorites', label: 'Saved', icon: Heart },
];

const onAir = computed(() => player.isLive.value && player.playing.value);
</script>

<template>
  <nav class="flex border-t border-border bg-background md:hidden">
    <NuxtLink
      v-for="tab in tabs"
      :key="tab.to"
      :to="tab.to"
      class="flex flex-1 flex-col items-center gap-1 py-2 text-[10px] text-muted-foreground transition"
      :class="tab.live && onAir && '!text-primary'"
      active-class="!text-foreground"
    >
      <component
        :is="tab.icon"
        class="size-5"
        :class="tab.live && onAir && 'animate-pulse'"
      />
      {{ tab.label }}
    </NuxtLink>
  </nav>
</template>
