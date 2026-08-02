<script setup lang="ts">
// One mark for the broadcast, used wherever it is represented — the player bar
// on both breakpoints, and the live page.
defineProps<{ pulse?: boolean }>();
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-primary uppercase"
  >
    <span
      class="size-1.5 rounded-full bg-primary"
      :class="pulse && 'animate-pulse'"
    />
    Live
  </span>
</template>
