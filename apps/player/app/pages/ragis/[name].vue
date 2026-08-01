<script setup lang="ts">
const route = useRoute();
const supabase = useSupabaseClient();
// The directory name, not the display name: it is the join key every shabad
// carries, so the URL keeps working when someone corrects the spelling.
const name = computed(() => decodeURIComponent(String(route.params.name)));

const { data: artist } = await useAsyncData(
  () => `artist-${name.value}`,
  async () => {
    const { data } = await supabase
      .from('artists')
      .select('name, display_name, photo_path')
      .eq('name', name.value)
      .maybeSingle();
    return data as {
      name: string;
      display_name: string | null;
      photo_path: string | null;
    } | null;
  },
  { watch: [name] }
);

const title = computed(() => artist.value?.display_name ?? name.value);

// Keyed on the ragi so two ragi pages cannot share one payload entry.
const list = useInfiniteList<any>(`ragi:${name.value}`, async (from, to) => {
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
        :name="title"
        :photo="artist?.photo_path"
        rounded="full"
        class="size-36 shrink-0 text-4xl shadow-xl"
      />
      <div class="min-w-0 pb-2">
        <p class="text-xs tracking-wide text-muted-foreground uppercase">
          Ragi
        </p>
        <h1 class="truncate text-4xl font-bold text-foreground">{{ title }}</h1>
        <p class="mt-2 text-sm text-muted-foreground">
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
