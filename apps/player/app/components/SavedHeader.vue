<script setup lang="ts">
/**
 * Shared header for the two saved shelves.
 *
 * Favorites and playlists are one destination as far as navigation is
 * concerned — the sidebar lists them separately, the phone reaches both through
 * More — and this is the fast flip between them once you are on either.
 */
const links = [
  { to: '/favorites', label: 'Favorites' },
  { to: '/playlists', label: 'Playlists' },
];
</script>

<template>
  <div class="mb-6 flex items-center">
    <nav class="flex gap-1 rounded-full bg-muted p-1">
      <NuxtLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        class="rounded-full px-4 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        active-class="bg-background !text-foreground"
      >
        {{ link.label }}
      </NuxtLink>
    </nav>
  </div>
</template>
