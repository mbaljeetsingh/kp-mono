<script setup lang="ts">
const route = useRoute();
const supabase = useSupabaseClient();
const name = computed(() => decodeURIComponent(String(route.params.name)));

const { data: tracks } = await useAsyncData(
  () => `artist:${name.value}`,
  async () => {
    const { data } = await supabase
      .from('tracks')
      .select('*')
      .eq('artist_dir', name.value)
      .is('missing_since', null)
      .order('date', { ascending: false, nullsFirst: false })
      .limit(500);
    return data;
  },
  { watch: [name] },
);
</script>

<template>
  <div>
    <NuxtLink to="/artists" class="text-xs text-neutral-500 hover:text-neutral-300">← Artists</NuxtLink>
    <h1 class="mt-2 text-lg">{{ name }}</h1>
    <p class="mb-4 text-xs text-neutral-500">{{ tracks?.length ?? 0 }} recordings</p>
    <TrackRow v-for="t in tracks ?? []" :key="t.id" :track="t" />
  </div>
</template>
