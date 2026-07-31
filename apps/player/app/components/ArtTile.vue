<script setup lang="ts">
import { artworkFor } from '~/composables/useArtwork';
const props = defineProps<{ name: string; rounded?: 'md' | 'full' }>();
const art = computed(() => artworkFor(props.name));
</script>

<template>
  <div
    class="grid place-items-center font-semibold text-white/80"
    :class="rounded === 'full' ? 'rounded-full' : 'rounded-md'"
    :style="art.style"
  >
    <span class="text-[0.9em]">{{ art.initials }}</span>
  </div>
</template>
