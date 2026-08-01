<script setup lang="ts">
import { ListMusic, Plus } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';

const auth = useAuth();
const playlists = usePlaylists();

// No `useAsyncData`: the list is account data, the server has no session, and
// the composable already loads and re-loads it on every session change. Fetching
// here as well would duplicate that request on the client and render nothing on
// the server either way.
</script>

<template>
  <div>
    <SavedHeader />

    <div v-if="auth.ready.value">
      <template v-if="auth.user.value">
        <div class="mb-4 flex items-center justify-between gap-3">
          <p class="text-sm text-muted-foreground">
            {{ playlists.playlists.value.length }}
            playlist{{ playlists.playlists.value.length === 1 ? '' : 's' }}
          </p>
          <Button size="sm" variant="outline" @click="playlists.promptNew()">
            <Plus class="size-4" /> New playlist
          </Button>
        </div>

        <NuxtLink
          v-for="playlist in playlists.playlists.value"
          :key="playlist.id"
          :to="`/playlists/${playlist.id}`"
          class="flex items-center gap-3 rounded-md px-3 py-2.5 transition hover:bg-white/5"
        >
          <span
            class="grid size-10 shrink-0 place-items-center rounded-md bg-muted"
          >
            <ListMusic class="size-4 text-muted-foreground" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm text-foreground">
              {{ playlist.name }}
            </span>
            <span class="block text-xs text-muted-foreground">
              {{ playlist.count }}
              shabad{{ playlist.count === 1 ? '' : 's' }}
            </span>
          </span>
        </NuxtLink>

        <EmptyState
          v-if="!playlists.playlists.value.length && !playlists.loading.value"
          title="No playlists yet"
          hint="Build one from any shabad's ⋯ menu, or start an empty one above."
        />
      </template>

      <!-- Playlists are the one thing here that needs an account, so the
           signed-out state says why rather than showing an empty shelf. -->
      <div v-else class="grid place-items-center py-20 text-center">
        <ListMusic class="size-9 text-muted-foreground" />
        <p class="mt-4 text-sm text-muted-foreground">
          Playlists need an account
        </p>
        <p class="mt-1 max-w-sm text-xs text-muted-foreground">
          Favorites work without one. A named collection is worth keeping
          somewhere sturdier than one browser.
        </p>
        <Button size="sm" class="mt-5" @click="auth.prompt()">Sign in</Button>
      </div>
    </div>
  </div>
</template>
