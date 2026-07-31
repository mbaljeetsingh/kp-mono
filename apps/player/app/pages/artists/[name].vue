<script setup lang="ts">
const route = useRoute();
const supabase = useSupabaseClient();
const name = computed(() => decodeURIComponent(String(route.params.name)));

const list = useInfiniteList<any>(async (from, to) => {
  const { data } = await supabase
    .from('shabads')
    .select('*')
    .eq('artist', name.value)
    .order('created_at', { ascending: false })
    .range(from, to);
  return data;
});
await list.loadMore();
</script>

<template>
  <div>
    <header class="mb-8 flex items-end gap-6">
      <ArtTile
        :name="name"
        rounded="full"
        class="size-36 shrink-0 text-4xl shadow-xl"
      />
      <div class="min-w-0 pb-2">
        <p class="text-xs tracking-wide text-neutral-400 uppercase">Artist</p>
        <h1 class="truncate text-4xl font-bold text-neutral-50">{{ name }}</h1>
        <p class="mt-2 text-sm text-neutral-400">
          {{ list.items.value.length }}{{ list.done.value ? '' : '+' }} shabads
        </p>
      </div>
    </header>

    <ShabadRow
      v-for="(s, i) in list.items.value"
      :key="s.id"
      :shabad="s"
      :index="i"
      :list="list.items.value"
    />
    <EmptyState
      v-if="!list.items.value.length"
      title="No shabads tagged for this artist yet"
      hint="Their recordings are in the archive — they appear here once segments are published."
    />
    <InfiniteScroll
      :loading="list.loading.value"
      :done="list.done.value"
      @more="list.loadMore"
    />
  </div>
</template>
