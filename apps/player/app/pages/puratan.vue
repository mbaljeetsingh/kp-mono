<script setup lang="ts">
const supabase = useSupabaseClient();

// Puratan is the one tier where each track is already a single shabad, and the
// title IS its first line — which is what makes it auto-matchable to BaniDB
// with no human tagging at all.
const { data: tracks } = await useAsyncData('puratan', async () => {
  const { data } = await supabase
    .from('tracks')
    .select('*')
    .eq('tree', 'puratan')
    .is('missing_since', null)
    .order('artist_dir')
    .limit(1200);
  return data;
});
</script>

<template>
  <div>
    <h1 class="text-lg">Puratan</h1>
    <p class="mb-4 text-xs text-neutral-500">
      Archival recordings · {{ tracks?.length ?? 0 }} shabads
    </p>
    <TrackRow v-for="t in tracks ?? []" :key="t.id" :track="t" />
  </div>
</template>
