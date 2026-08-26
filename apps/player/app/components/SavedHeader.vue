<script setup lang="ts">
/**
 * Shared header for the two saved shelves.
 *
 * Favorites and playlists are one destination as far as the tab bar is
 * concerned — five tabs is its ceiling, so they share the "Saved" entry and
 * switch here. The account control and the theme switch ride along because
 * these pages are the only place they can live on touch, where there is no
 * sidebar.
 */
const links = [
  { to: '/favorites', label: 'Favorites' },
  { to: '/playlists', label: 'Playlists' },
];
</script>

<template>
  <div class="mb-6 flex items-center justify-between gap-3">
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
    <!-- Wrapped rather than given the class directly: AccountButton renders
         nothing until the session is known, so it has no single root element for
         a class to land on. -->
    <div class="flex items-center gap-1 md:hidden">
      <ThemeToggle compact />
      <AccountButton compact />
    </div>
  </div>
</template>
