<script setup lang="ts">
const supabase = useSupabaseClient();
const favorites = useFavorites();

const { data: shabads } = await useAsyncData(
  'favorites',
  async () => {
    if (!favorites.ids.value.length) return [];
    const { data } = await supabase
      .from('shabads')
      .select('*')
      .in('id', favorites.ids.value);
    return data;
  },
  { watch: [favorites.ids] }
);
</script>

<template>
  <div>
    <h1 class="mb-6 text-2xl font-semibold text-neutral-100">Favorites</h1>
    <ShabadRow
      v-for="(s, i) in shabads ?? []"
      :key="s.id"
      :shabad="s"
      :index="i"
      :list="shabads ?? []"
    />
    <EmptyState
      v-if="!shabads?.length"
      title="Nothing saved yet"
      hint="Tap the heart on any shabad. Favorites stay on this device."
    />
  </div>
</template>
