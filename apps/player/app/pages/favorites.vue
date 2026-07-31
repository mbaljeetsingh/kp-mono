<script setup lang="ts">
import { Heart } from 'lucide-vue-next';
const supabase = useSupabaseClient();

// Favorites live in localStorage, keyed by the track's stable id — so they
// survive a URL change on SGPC's side and migrate cleanly into an account if
// auth ever lands. Listening never requires a login.
const ids = useLocalStorage<string[]>('kp:favorites', []);

const { data: tracks } = await useAsyncData(
  'favorites',
  async () => {
    if (!ids.value.length) return [];
    const { data } = await supabase
      .from('tracks')
      .select('*')
      .in('id', ids.value);
    return data;
  },
  { watch: [ids] }
);
</script>

<template>
  <div>
    <h1 class="mb-6 text-2xl font-semibold text-neutral-100">Favorites</h1>
    <div
      v-if="!tracks?.length"
      class="grid place-items-center py-20 text-center"
    >
      <Heart class="size-10 text-neutral-700" />
      <p class="mt-4 text-sm text-neutral-500">Nothing saved yet.</p>
      <p class="mt-1 text-xs text-neutral-600">
        Saved recordings stay on this device.
      </p>
    </div>
    <TrackRow
      v-for="(t, i) in tracks ?? []"
      :key="t.id"
      :track="t"
      :index="i"
    />
  </div>
</template>
