<script setup lang="ts">
const supabase = useSupabaseClient();
const q = ref('');

// Search is the product's primary action, so it queries on every keystroke
// (debounced) rather than sitting behind a submit button.
const debounced = refDebounced(q, 250);

const { data: results } = await useAsyncData(
  'search',
  async () => {
    const term = debounced.value.trim();
    if (term.length < 2) return null;
    // Day files are indexed but never surfaced: 563MB, ~20 hours, unusable
    // as tracks. They exist for later segmenting, not for browsing.
    const { data } = await supabase
      .from('tracks')
      .select('*')
      .neq('tree', 'daywise')
      .is('missing_since', null)
      .or(`artist_dir.ilike.%${term}%,title.ilike.%${term}%,raw_filename.ilike.%${term}%`)
      .limit(50);
    return data;
  },
  { watch: [debounced] },
);

const { data: recent } = await useAsyncData('recent', async () => {
  const { data } = await supabase
    .from('tracks')
    .select('*')
    .eq('tree', 'ragiwise')
    .is('missing_since', null)
    .not('date', 'is', null)
    .order('date', { ascending: false })
    .limit(25);
  return data;
});
</script>

<template>
  <div>
    <input
      v-model="q"
      type="search"
      placeholder="Search artists, shabads, recordings…"
      class="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3 text-sm outline-none focus:border-neutral-600"
    >

    <section v-if="results" class="mt-6">
      <h2 class="mb-2 text-xs uppercase tracking-wide text-neutral-500">
        {{ results.length }} result{{ results.length === 1 ? '' : 's' }}
      </h2>
      <TrackRow v-for="t in results" :key="t.id" :track="t" />
      <p v-if="!results.length" class="px-3 py-6 text-sm text-neutral-500">
        Nothing found. Untagged recordings are searchable by artist and date —
        shabad search grows as segments get tagged.
      </p>
    </section>

    <section v-else class="mt-8">
      <h2 class="mb-2 text-xs uppercase tracking-wide text-neutral-500">Recent</h2>
      <TrackRow v-for="t in recent ?? []" :key="t.id" :track="t" />
    </section>
  </div>
</template>
