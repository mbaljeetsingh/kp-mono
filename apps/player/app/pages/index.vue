<script setup lang="ts">
import { Search } from 'lucide-vue-next';

const supabase = useSupabaseClient();
const q = ref('');
const debounced = refDebounced(q, 250);

// Everything the player shows comes from published shabads, never raw files —
// a 70-minute set or a 37-minute archival performance isn't listenable until
// somebody has marked where each shabad begins and ends.
const { data: results } = await useAsyncData(
  'search',
  async () => {
    const term = debounced.value.trim();
    if (term.length < 2) return null;
    const v = escapeFilterValue(term);
    const { data, error } = await supabase
      .from('shabads')
      .select('*')
      .or(`name.ilike.${v},artist.ilike.${v},raag.ilike.${v}`)
      .limit(60);
    if (error) console.error('search failed', error.message);
    return data ?? [];
  },
  { watch: [debounced] }
);

const recent = useInfiniteList<any>('recent', async (from, to) => {
  const { data } = await supabase
    .from('shabads')
    .select('*')
    .order('created_at', { ascending: false })
    .range(from, to);
  return data;
});
await recent.loadMore();

const { data: artists } = await useAsyncData('top-artists', async () => {
  const { data } = await supabase.rpc('artist_counts');
  return (data as any[]) ?? [];
});
</script>

<template>
  <div>
    <div class="relative mb-8 max-w-xl">
      <Search
        class="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-neutral-500"
      />
      <input
        v-model="q"
        type="search"
        placeholder="Search shabads, artists, raags"
        class="w-full rounded-full bg-neutral-800 py-3 pr-4 pl-10 text-sm text-neutral-100 ring-neutral-600 outline-none placeholder:text-neutral-500 focus:ring-2"
      />
    </div>

    <section v-if="results">
      <h2 class="mb-3 text-lg font-semibold text-neutral-100">
        {{ results.length }} shabad{{ results.length === 1 ? '' : 's' }}
      </h2>
      <ShabadRow
        v-for="(s, i) in results"
        :key="s.id"
        :shabad="s"
        :index="i"
        :list="results"
      />
      <EmptyState
        v-if="!results.length"
        title="No shabads matched"
        hint="Only tagged shabads are searchable. Coverage grows as contributors tag."
      />
    </section>

    <template v-else>
      <section v-if="artists?.length" class="mb-10">
        <!-- 12 divides evenly into every breakpoint's column count, so the
             grid always ends on a full row and the cut never looks accidental.
             That is also why it needs saying out loud that there are more. -->
        <div class="mb-4 flex items-baseline justify-between gap-4">
          <h2 class="text-xl font-semibold text-neutral-100">Ragis</h2>
          <NuxtLink
            v-if="artists.length > 12"
            to="/ragis"
            class="shrink-0 text-xs text-neutral-400 transition hover:text-neutral-100"
          >
            View all {{ artists.length }}
          </NuxtLink>
        </div>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <ArtistCard
            v-for="a in artists.slice(0, 12)"
            :key="a.artist_dir"
            :name="a.artist_dir"
            :photo="a.photo_path"
            :count="a.shabads"
          />
        </div>
      </section>

      <section>
        <h2 class="mb-1 text-xl font-semibold text-neutral-100">
          Recently added
        </h2>
        <ShabadRow
          v-for="(s, i) in recent.items.value"
          :key="s.id"
          :shabad="s"
          :index="i"
          :list="recent.items.value"
        />
        <EmptyState
          v-if="!recent.items.value.length"
          title="No shabads published yet"
          hint="Tag a few in the admin app and publish them — they appear here immediately."
        />
        <InfiniteScroll
          :loading="recent.loading.value"
          :done="recent.done.value"
          @more="recent.loadMore"
        />
      </section>
    </template>
  </div>
</template>
