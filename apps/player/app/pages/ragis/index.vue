<script setup lang="ts">
const supabase = useSupabaseClient();

// artist_directory() lists everyone SGPC publishes, with a shabad count that
// may be zero — the page would otherwise be near-empty until tagging catches
// up, which hides the scale of the archive rather than showing it.
const { data: artists } = await useAsyncData('artists', async () => {
  const { data } = await supabase.rpc('artist_directory');
  return (data ?? []) as {
    name: string;
    display_name: string;
    photo_path: string | null;
    shabads: number;
  }[];
});
</script>

<template>
  <div>
    <h1 class="mb-1 text-2xl font-semibold text-neutral-100">Ragis</h1>
    <p class="mb-6 text-sm text-neutral-500">
      {{ artists?.length ?? 0 }} ragis
    </p>
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <ArtistCard
        v-for="a in artists ?? []"
        :key="a.name"
        :name="a.name"
        :display="a.display_name"
        :photo="a.photo_path"
        :count="a.shabads"
      />
    </div>
  </div>
</template>
