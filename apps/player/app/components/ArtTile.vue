<script setup lang="ts">
import { artworkFor } from '~/composables/useArtwork';

const props = defineProps<{
  name: string;
  /** Storage filename, when SGPC published a photo for this artist. */
  photo?: string | null;
  rounded?: 'md' | 'full';
}>();

const art = computed(() => artworkFor(props.name));

// Public bucket, so the URL is predictable and needs no round trip to sign.
const config = useRuntimeConfig();
const src = computed(() =>
  props.photo
    ? `${config.public.supabaseUrl}/storage/v1/object/public/artist-photos/${encodeURIComponent(props.photo)}`
    : null
);

// SGPC's roster lists photos that 404, and storage could be unreachable, so a
// failed load falls back to the gradient rather than leaving a broken tile.
const failed = ref(false);
</script>

<template>
  <div
    class="relative grid place-items-center overflow-hidden font-semibold text-white/80"
    :class="rounded === 'full' ? 'rounded-full' : 'rounded-md'"
    :style="art.style"
  >
    <img
      v-if="src && !failed"
      :src="src"
      :alt="name"
      loading="lazy"
      class="absolute inset-0 size-full object-cover"
      @error="failed = true"
    />
    <span v-else class="text-[0.9em]">{{ art.initials }}</span>
  </div>
</template>
