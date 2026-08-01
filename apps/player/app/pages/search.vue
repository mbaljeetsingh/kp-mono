<script setup lang="ts">
import { Search } from 'lucide-vue-next';
import { Input } from '@/components/ui/input';

const supabase = useSupabaseClient();
const q = ref('');
const debounced = refDebounced(q, 250);

const { data: results, status } = await useAsyncData(
  'search-page',
  async () => {
    const term = debounced.value.trim();
    if (term.length < 2) return null;
    const v = escapeFilterValue(term);
    const { data, error } = await supabase
      .from('shabads')
      .select('*')
      .or(`name.ilike.${v},artist.ilike.${v},raag.ilike.${v}`)
      .limit(80);
    if (error) console.error('search failed', error.message);
    return data ?? [];
  },
  { watch: [debounced] }
);
</script>

<template>
  <div>
    <div class="relative mb-6">
      <Search
        class="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        v-model="q"
        type="search"
        autofocus
        placeholder="Search shabads, artists, raags"
        class="h-12 rounded-full border-0 bg-muted pr-4 pl-10 text-sm"
      />
    </div>

    <ShabadRow
      v-for="(s, i) in results ?? []"
      :key="s.id"
      :shabad="s"
      :index="i"
      :list="results ?? []"
    />

    <EmptyState
      v-if="results && !results.length && status !== 'pending'"
      title="No shabads matched"
      hint="Only tagged shabads are searchable. Coverage grows as contributors tag."
    />
    <EmptyState
      v-else-if="!results"
      title="Search the archive"
      hint="Find a shabad by its name, the ragi who sang it, or its raag."
    />
  </div>
</template>
