<script setup lang="ts">
import { Music4 } from 'lucide-vue-next';
defineProps<{ title: string; hint?: string }>();
</script>

<template>
  <div class="grid place-items-center py-20 text-center">
    <Music4 class="size-9 text-neutral-700" />
    <p class="mt-4 text-sm text-neutral-400">{{ title }}</p>
    <p v-if="hint" class="mt-1 max-w-sm text-xs text-neutral-600">{{ hint }}</p>
  </div>
</template>
