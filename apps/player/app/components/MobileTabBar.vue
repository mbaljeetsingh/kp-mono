<script setup lang="ts">
import { Home, Search, Users, Radio, Heart } from 'lucide-vue-next';

// Five destinations is the ceiling for a thumb-reachable bar; anything more
// and the targets get too narrow to hit reliably.
const tabs = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/artists', label: 'Artists', icon: Users },
  { to: '/live', label: 'Live', icon: Radio },
  { to: '/favorites', label: 'Saved', icon: Heart },
];
</script>

<template>
  <nav class="flex border-t border-neutral-800/80 bg-neutral-950 md:hidden">
    <NuxtLink
      v-for="tab in tabs"
      :key="tab.to"
      :to="tab.to"
      class="flex flex-1 flex-col items-center gap-1 py-2 text-[10px] text-neutral-500 transition"
      active-class="!text-neutral-100"
    >
      <component :is="tab.icon" class="size-5" />
      {{ tab.label }}
    </NuxtLink>
  </nav>
</template>
