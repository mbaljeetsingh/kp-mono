<script setup>
import { computed } from 'vue';
import { CheckCircle, File, Loader2, X } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
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

const files = computed(() => props.dropzone.files.value);
const loading = computed(() => props.dropzone.loading.value);
const errors = computed(() => props.dropzone.errors.value);
const successes = computed(() => props.dropzone.successes.value);
const isSuccess = computed(() => props.dropzone.isSuccess.value);
const maxFileSize = computed(() => props.dropzone.maxFileSize);
const maxFiles = computed(() => props.dropzone.maxFiles);

const exceedMaxFiles = computed(() => files.value.length > maxFiles.value);

const handleRemoveFile = (fileName) => {
  props.dropzone.setFiles(files.value.filter((file) => file.name !== fileName));
};

const isSuccessfullyUploaded = (fileName) => {
  return successes.value.includes(fileName);
};

const getFileError = (fileName) => {
  return errors.value.find((e) => e.name === fileName);
};

const handleUpload = () => {
  props.dropzone.onUpload();
};
</script>

<template>
  <!-- Success state -->
  <div
    v-if="isSuccess"
    :class="cn('flex flex-row items-center gap-x-2 justify-center', props.class)"
  >
    <CheckCircle :size="16" class="text-primary" />
    <p class="text-primary text-sm">
      Successfully uploaded {{ files.length }} file{{ files.length > 1 ? 's' : '' }}
    </p>
  </div>

  <!-- File list -->
  <div v-else :class="cn('flex flex-col', props.class)">
    <div
      v-for="(file, idx) in files"
      :key="`${file.name}-${idx}`"
      class="flex items-center gap-x-4 border-b py-2 first:mt-4 last:mb-4"
    >
      <!-- Image preview or file icon -->
      <div
        v-if="file.type?.startsWith('image/')"
        class="h-10 w-10 rounded border overflow-hidden shrink-0 bg-muted flex items-center justify-center"
      >
        <img :src="file.preview" :alt="file.name" class="object-cover w-full h-full" />
      </div>
      <div
        v-else
        class="h-10 w-10 rounded border bg-muted flex items-center justify-center shrink-0"
      >
        <File :size="18" />
      </div>

      <!-- File name and status -->
      <div class="shrink grow flex flex-col items-start truncate">
        <p :title="file.name" class="text-sm truncate max-w-full">
          {{ file.name }}
        </p>

        <!-- File errors -->
        <p v-if="file.errors?.length > 0" class="text-xs text-destructive">
          {{
            file.errors
              .map((e) =>
                e.message.startsWith('File is larger than')
                  ? `File is larger than ${formatBytes(maxFileSize, 2)} (Size: ${formatBytes(file.size, 2)})`
                  : e.message
              )
              .join(', ')
          }}
        </p>

        <!-- Uploading state -->
        <p
          v-else-if="loading && !isSuccessfullyUploaded(file.name)"
          class="text-xs text-muted-foreground"
        >
          Uploading file...
        </p>

        <!-- Upload error -->
        <p v-else-if="getFileError(file.name)" class="text-xs text-destructive">
          Failed to upload: {{ getFileError(file.name).message }}
        </p>

        <!-- Success -->
        <p v-else-if="isSuccessfullyUploaded(file.name)" class="text-xs text-primary">
          Successfully uploaded file
        </p>

        <!-- File size -->
        <p v-else class="text-xs text-muted-foreground">
          {{ formatBytes(file.size, 2) }}
        </p>
      </div>

      <!-- Remove button -->
      <Button
        v-if="!loading && !isSuccessfullyUploaded(file.name)"
        size="icon"
        variant="ghost"
        class="shrink-0 justify-self-end text-muted-foreground hover:text-foreground"
        @click.stop="handleRemoveFile(file.name)"
      >
        <X :size="16" />
      </Button>
    </div>

    <!-- Exceed max files warning -->
    <p v-if="exceedMaxFiles" class="text-sm text-left mt-2 text-destructive">
      You may upload only up to {{ maxFiles }} files, please remove
      {{ files.length - maxFiles }} file{{ files.length - maxFiles > 1 ? 's' : '' }}.
    </p>

    <!-- Upload button -->
    <div v-if="files.length > 0 && !exceedMaxFiles" class="mt-2">
      <Button
        variant="outline"
        :disabled="files.some((file) => file.errors?.length > 0) || loading"
        @click.stop="handleUpload"
      >
        <template v-if="loading">
          <Loader2 class="mr-2 h-4 w-4 animate-spin" />
          Uploading...
        </template>
        <template v-else>
          Upload files
        </template>
      </Button>
    </div>
  </div>
</template>
