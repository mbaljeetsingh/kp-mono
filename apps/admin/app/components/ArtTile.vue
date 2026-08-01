<script setup lang="ts">
/**
 * Artist thumbnail. Mirrors the player's tile so a recording is recognisable
 * by face in both apps.
 *
 * SGPC publishes a photo for 155 of its 230 artists; the rest fall back to a
 * deterministic gradient, which is the normal case rather than an edge case.
 */
const props = defineProps<{ name: string; photo?: string | null }>();

function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const HUES = [18, 32, 45, 8, 340, 268, 200, 165, 100, 55];

const art = computed(() => {
  const h = hash(props.name || 'kirtan');
  const i = h % HUES.length;
  const hue = HUES[i];
  const hue2 = HUES[(i + 1 + ((h >> 8) % (HUES.length - 1))) % HUES.length];
  return {
    backgroundImage: `linear-gradient(135deg, oklch(0.62 0.13 ${hue}) 0%, oklch(0.32 0.07 ${hue2}) 100%)`,
  };
});

const initials = computed(() =>
  props.name
    .replace(/^(bhai|bibi|giani|ustad)\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
);

const config = useRuntimeConfig();
const src = computed(() =>
  props.photo
    ? `${config.public.supabaseUrl}/storage/v1/object/public/artist-photos/${encodeURIComponent(props.photo)}`
    : null
);
const failed = ref(false);
</script>

<template>
  <div
    class="relative grid shrink-0 place-items-center overflow-hidden rounded-full text-[10px] font-semibold text-white/80"
    :style="art"
  >
    <img
      v-if="src && !failed"
      :src="src"
      :alt="name"
      loading="lazy"
      class="absolute inset-0 size-full object-cover"
      @error="failed = true"
    />
    <span v-else>{{ initials }}</span>
  </div>
</template>
