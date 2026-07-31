<script setup lang="ts">
const supabase = useSupabaseClient();

// Artist attribution needs no tagging — it comes free from the directory name,
// so these pages work at zero tagging coverage.
const { data: artists } = await useAsyncData('artists', async () => {
  const { data } = await supabase.rpc('artist_counts');
  return data as { artist_dir: string; tracks: number }[] | null;
});
</script>

<template>
  <div>
    <h1 class="mb-4 text-xs uppercase tracking-wide text-neutral-500">
      Artists ({{ artists?.length ?? 0 }})
    </h1>
    <div class="grid gap-1 sm:grid-cols-2">
      <NuxtLink
        v-for="a in artists ?? []"
        :key="a.artist_dir"
        :to="`/artists/${encodeURIComponent(a.artist_dir)}`"
        class="flex items-baseline justify-between rounded px-3 py-2 hover:bg-neutral-900"
      >
        <span class="truncate text-sm">{{ a.artist_dir }}</span>
        <span class="ml-3 shrink-0 text-xs tabular-nums text-neutral-500">{{ a.tracks }}</span>
      </NuxtLink>
    </div>
  </div>
</template>
