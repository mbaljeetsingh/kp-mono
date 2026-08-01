<script setup>
import { computed } from 'vue';
import { Upload } from 'lucide-vue-next';
import { formatBytes } from './utils';
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
   * Additional CSS classes
   */
  class: {
    type: String,
    default: '',
  },
});

const isSuccess = computed(() => props.dropzone.isSuccess.value);
const maxFiles = computed(() => props.dropzone.maxFiles);
const maxFileSize = computed(() => props.dropzone.maxFileSize);
const hasFiles = computed(() => props.dropzone.files.value.length > 0);

const openFilePicker = () => {
  props.dropzone.openFilePicker();
};
</script>

<template>
  <div
    v-if="!isSuccess && !hasFiles"
    :class="cn('flex flex-col items-center gap-y-2', props.class)"
  >
    <Upload :size="20" class="text-muted-foreground" />
    <p class="text-sm">
      Upload{{ maxFiles && maxFiles > 1 ? ` ${maxFiles}` : '' }}
      file{{ !maxFiles || maxFiles > 1 ? 's' : '' }}
    </p>
    <div class="flex flex-col items-center gap-y-1">
      <p class="text-xs text-muted-foreground">
        Drag and drop or
        <a
          class="underline cursor-pointer transition hover:text-foreground"
          @click.stop="openFilePicker"
        >
          select {{ maxFiles === 1 ? 'file' : 'files' }}
        </a>
        to upload
      </p>
      <p
        v-if="maxFileSize !== Number.POSITIVE_INFINITY"
        class="text-xs text-muted-foreground"
      >
        Maximum file size: {{ formatBytes(maxFileSize, 2) }}
      </p>
    </div>
  </div>
</template>
