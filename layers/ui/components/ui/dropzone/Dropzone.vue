<script setup>
import { computed } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps({
  /**
   * Dropzone state from useSupabaseUpload
   */
  dropzone: {
    type: Object,
    required: true,
  },
  /**
   * Additional CSS classes (any Vue class binding value — string/object/array)
   */
  class: {
    type: [String, Object, Array],
    default: '',
  },
});

const isActive = computed(() => props.dropzone.isDragActive.value);
const isSuccess = computed(() => props.dropzone.isSuccess.value);
const isInvalid = computed(() => {
  const { isDragActive, isDragReject, errors, files } = props.dropzone;
  return (
    (isDragActive.value && isDragReject.value) ||
    (errors.value.length > 0 && !isSuccess.value) ||
    files.value.some((file) => file.errors.length !== 0)
  );
});

const rootProps = computed(() => props.dropzone.getRootProps());
const inputProps = computed(() => props.dropzone.getInputProps());
</script>

<template>
  <div
    v-bind="rootProps"
    :class="
      cn(
        'border-2 border-muted-foreground/25 rounded-lg p-6 text-center bg-card transition-colors duration-300 text-foreground cursor-pointer',
        props.class,
        isSuccess ? 'border-solid border-primary/50' : 'border-dashed',
        isActive && 'border-primary bg-primary/10',
        isInvalid && 'border-destructive bg-destructive/10'
      )
    "
  >
    <input v-bind="inputProps" :ref="(el) => (dropzone.inputRef.value = el)" />
    <slot />
  </div>
</template>
