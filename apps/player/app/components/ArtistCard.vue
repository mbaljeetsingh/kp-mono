<script setup lang="ts">
defineProps<{ name: string; count?: number }>();
</script>

<template>
  <NuxtLink
    :to="`/artists/${encodeURIComponent(name)}`"
    class="group rounded-lg bg-neutral-900/60 p-3 transition hover:bg-neutral-800"
  >
    <ArtTile
      :name="name"
      rounded="full"
      class="mb-3 aspect-square w-full text-3xl"
    />
    <p class="truncate text-sm text-neutral-100">{{ name }}</p>
    <p class="truncate text-xs text-neutral-500">
      {{
        count != null
          ? `${count} ${count === 1 ? 'shabad' : 'shabads'}`
          : 'Artist'
      }}
    </p>
  </NuxtLink>
</template>
