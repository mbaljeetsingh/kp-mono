<script setup lang="ts">
import { Search } from 'lucide-vue-next';
import { Input } from '@/components/ui/input';

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

// A shelf, not the archive. This scrolled forever in pages of 50, so "recently
// added" grew into every published shabad there has ever been and home had no
// bottom — while the thing it is actually answering is "what is new since I was
// last here", which twenty rows covers. Everything is still reachable: Search
// takes a term and Ragis takes a name.
const RECENT_LIMIT = 20;

const { data: recent } = await useAsyncData('recent', async () => {
  const { data, error } = await supabase
    .from('shabads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(RECENT_LIMIT);
  if (error) console.error('recent failed', error.message);
  return data ?? [];
});

const { data: artists } = await useAsyncData('top-artists', async () => {
  const { data } = await supabase.rpc('artist_counts');
  return (data as any[]) ?? [];
});
</script>

<template>
  <div>
    <div class="relative mb-8 max-w-xl">
      <Search
        class="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        v-model="q"
        type="search"
        placeholder="Search shabads, artists, raags"
        class="h-12 rounded-full border-0 bg-muted pr-4 pl-10 text-base md:text-sm"
      />
    </div>

    <section v-if="results">
      <h2 class="mb-3 text-lg font-semibold text-foreground">
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
          <h2 class="text-xl font-semibold text-foreground">Ragis</h2>
          <NuxtLink
            v-if="artists.length > 12"
            to="/ragis"
            class="shrink-0 text-xs text-muted-foreground transition hover:text-foreground"
          >
            View all {{ artists.length }}
          </NuxtLink>
        </div>
        <!-- A shelf on a phone, a grid where there is width for one.
             Twelve tiles two-across cost 1414px — 2.6 screens of a 390px
             phone — so a first visit was a wall of circles and the first
             shabad you could actually play sat three screens down. Sideways is
             the direction a phone has to spare, which is why every music app
             browses entities this way.
             Bleeding the row past the page's padding, and putting that padding
             back inside it, is what lets a tile scroll off the edge instead of
             being clipped short of it. -->
        <div
          class="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-6"
        >
          <ArtistCard
            v-for="a in artists.slice(0, 12)"
            :key="a.artist"
            :name="a.artist"
            :display="a.display_name"
            :photo="a.photo_path"
            :count="a.shabads"
            class="w-32 shrink-0 sm:w-auto"
          />
        </div>
      </section>

      <section>
        <h2 class="mb-1 text-xl font-semibold text-foreground">
          Recently added
        </h2>
        <ShabadRow
          v-for="(s, i) in recent ?? []"
          :key="s.id"
          :shabad="s"
          :index="i"
          :list="recent ?? []"
        />
        <EmptyState
          v-if="!recent?.length"
          title="No shabads published yet"
          hint="Tag a few in the admin app and publish them — they appear here immediately."
        />
      </section>
    </template>
  </div>
</template>
