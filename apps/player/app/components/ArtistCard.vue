<script setup lang="ts">
const props = defineProps<{
  /** Directory name — the join key every shabad carries, so it drives the link. */
  name: string;
  /** Corrected spelling, when there is one. Only ever shown, never linked. */
  display?: string | null;
  count?: number;
  photo?: string | null;
}>();

const label = computed(() => props.display ?? props.name);
</script>

<template>
  <NuxtLink
    :to="`/ragis/${encodeURIComponent(name)}`"
    class="group rounded-lg bg-neutral-900/60 p-3 transition hover:bg-neutral-800"
  >
    <ArtTile
      :name="label"
      :photo="photo"
      rounded="full"
      class="mb-3 aspect-square w-full text-3xl"
    />
    <p class="truncate text-sm text-neutral-100">{{ label }}</p>
    <p class="truncate text-xs text-neutral-500">
      {{
        count != null
          ? `${count} ${count === 1 ? 'shabad' : 'shabads'}`
          : 'Ragi'
      }}
    </p>
  </NuxtLink>
</template>
