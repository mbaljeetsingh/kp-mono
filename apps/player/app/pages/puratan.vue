<script setup lang="ts">
const supabase = useSupabaseClient();

// Puratan files are archival performances, not single shabads — measured
// lengths run from 8 to 37 minutes — so they are segmented like everything else.
const list = useInfiniteList<any>(async (from, to) => {
  const { data } = await supabase
    .from('shabads')
    .select('*')
    .eq('tree', 'puratan')
    .order('name')
    .range(from, to);
  return data;
});
await list.loadMore();
</script>

<template>
  <div>
    <h1 class="mb-1 text-2xl font-semibold text-neutral-100">Puratan</h1>
    <p class="mb-6 text-sm text-neutral-500">Archival recordings</p>
    <ShabadRow
      v-for="(s, i) in list.items.value"
      :key="s.id"
      :shabad="s"
      :index="i"
      :list="list.items.value"
    />
    <EmptyState
      v-if="!list.items.value.length"
      title="No puratan shabads published yet"
      hint="1,051 archival recordings are indexed and waiting to be segmented."
    />
    <InfiniteScroll
      :loading="list.loading.value"
      :done="list.done.value"
      @more="list.loadMore"
    />
  </div>
</template>
