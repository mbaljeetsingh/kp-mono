<script setup lang="ts">
const supabase = useSupabaseClient();
// Artist attribution needs no tagging — it comes free from the directory name,
// so these pages are complete at zero tagging coverage.
const { data: artists } = await useAsyncData('artists', async () => {
  const { data } = await supabase.rpc('artist_counts');
  return data as { artist_dir: string; shabads: number }[] | null;
});
</script>

<template>
  <div>
    <h1 class="mb-1 text-2xl font-semibold text-neutral-100">Artists</h1>
    <p class="mb-6 text-sm text-neutral-500">
      {{ artists?.length ?? 0 }} artists with tagged shabads
    </p>
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <ArtistCard
        v-for="a in artists ?? []"
        :key="a.artist_dir"
        :name="a.artist_dir"
        :count="a.shabads"
      />
    </div>
  </div>
</template>
