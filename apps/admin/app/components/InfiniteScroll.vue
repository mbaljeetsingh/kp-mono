<script setup lang="ts">
const emit = defineEmits<{ more: [] }>();
defineProps<{ loading?: boolean; done?: boolean }>();
const sentinel = useTemplateRef<HTMLElement>('sentinel');

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
    <p v-if="loading" class="py-3 text-center text-xs text-muted-foreground">
      Loading…
    </p>
  </div>
</template>
