<script setup lang="ts">
const emit = defineEmits<{ more: [] }>();
defineProps<{ loading?: boolean; done?: boolean }>();
const sentinel = useTemplateRef<HTMLElement>('sentinel');

// Fires slightly before the sentinel is visible so the next page is usually
// already in place by the time the listener reaches the end of the list.
useIntersectionObserver(
  sentinel,
  ([entry]) => {
    if (entry?.isIntersecting) emit('more');
  },
  { rootMargin: '600px' }
);
</script>

<template>
  <div ref="sentinel" class="h-8">
    <p v-if="loading" class="py-3 text-center text-xs text-neutral-600">
      Loading…
    </p>
  </div>
</template>
