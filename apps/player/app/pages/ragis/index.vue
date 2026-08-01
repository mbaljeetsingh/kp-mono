<script setup lang="ts">
const supabase = useSupabaseClient();

// artist_directory() returns only ragis with at least one published shabad —
// a card that leads to an empty page is worse than no card.
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
