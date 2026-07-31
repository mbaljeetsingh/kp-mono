<script setup lang="ts">
const supabase = useSupabaseClient();
const q = ref('');

// Ragiwise sets are the tagging surface: 70 minutes, already attributed to an
// artist and date. Day files (563MB, ~20 hours) are deliberately excluded —
// they exist as source material, not as something a human should scrub through.
const { data: tracks, refresh } = await useAsyncData('tag-queue', async () => {
  let query = supabase
    .from('tracks')
    .select('id, artist_dir, date, raw_filename, title, tree, url, slot_start_sec, slot_end_sec')
    .in('tree', ['ragiwise', 'puratan'])
    .is('missing_since', null)
    .limit(60);
  if (q.value.trim().length > 1) query = query.ilike('artist_dir', `%${q.value.trim()}%`);
  const { data } = await query;
  return data;
});

watchDebounced(q, () => refresh(), { debounce: 250 });
</script>

<template>
  <div>
    <input v-model="q" type="search" placeholder="Filter by artist…"
      class="mb-4 w-full rounded bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm">
    <NuxtLink
      v-for="t in tracks ?? []" :key="t.id" :to="`/tag/${t.id}`"
      class="flex items-center gap-3 rounded px-3 py-2 hover:bg-neutral-900"
    >
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm">{{ t.title ?? t.raw_filename.replace(/\.[^.]+$/, '') }}</span>
        <span class="block truncate text-xs text-neutral-500">
          {{ [t.artist_dir, t.date].filter(Boolean).join(' · ') }}
        </span>
      </span>
      <span class="shrink-0 text-xs text-neutral-600">tag →</span>
    </NuxtLink>
  </div>
</template>
