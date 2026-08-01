<script setup lang="ts">
import { computed } from 'vue';
import { Button } from '@/components/ui/button';
import { chunk } from '~/lib/utils';

const supabase = useSupabaseClient();
const favorites = useFavorites();
const auth = useAuth();

// Fetched from ids rather than from `favorite_shabads`, because the ids are the
// one thing both modes share: signed out they come from localStorage, where the
// account view would return nothing.
//
// `server: false` is not an optimisation, it is the fix for an empty list. The
// ids live in localStorage or behind a session, so the server always computes
// this as zero favorites — and Nuxt then hydrates that payload and, seeing no
// *change* in the watched ids (the client reads localStorage synchronously,
// before the watcher exists), never refetches. Fetching on the client only
// means the first read already has the real ids.
const { data: shabads } = await useAsyncData(
  'favorites',
  async () => {
    if (!favorites.ids.value.length) return [];
    // Batched, because this filter rides in the query string: one request per
    // ~100 ids, where a single request for a few hundred favorites exceeds the
    // gateway's URI limit and fails outright. See `chunk`.
    const batches = await Promise.all(
      chunk(favorites.ids.value).map((batch) =>
        supabase.from('shabads').select('*').in('id', batch)
      )
    );
    const failed = batches.find((b) => b.error);
    if (failed) console.error('favorites failed', failed.error?.message);
    return batches.flatMap((b) => b.data ?? []);
  },
  { server: false, watch: [favorites.ids] }
);

// `in()` returns rows in whatever order Postgres finds them; the ids are held
// newest-first, and that is the order the listener saved them in.
const ordered = computed(() => {
  const rows = shabads.value ?? [];
  const order = favorites.ids.value;
  return [...rows].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
});
</script>

<template>
  <div>
    <SavedHeader />

    <ShabadRow
      v-for="(s, i) in ordered"
      :key="s.id"
      :shabad="s"
      :index="i"
      :list="ordered"
    />
    <EmptyState
      v-if="!ordered.length"
      title="Nothing saved yet"
      hint="Tap the heart on any shabad."
    />

    <!-- Only worth saying once the session is known, and only to guests:
         telling a signed-in listener their favorites are device-local would be
         wrong, and saying it before `ready` would flash it at everyone. -->
    <div
      v-if="auth.ready.value && !auth.user.value"
      class="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-border p-4"
    >
      <p class="min-w-0 flex-1 text-xs text-muted-foreground">
        These favorites are saved on this device. Sign in and they follow you —
        the list comes across as it is, nothing is lost.
      </p>
      <Button size="sm" variant="outline" @click="auth.prompt()">
        Sign in
      </Button>
    </div>
  </div>
</template>
