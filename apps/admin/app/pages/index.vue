<script setup lang="ts">
import { Clock, Layers } from 'lucide-vue-next';

const supabase = useSupabaseClient();
const q = ref('');
const debounced = refDebounced(q, 300);

// Shortest-first is the default because a recording a volunteer can finish in
// one sitting is worth more than a longer one they abandon halfway.
const sort = ref<'shortest' | 'untagged'>('shortest');

const list = useInfiniteList<any>(async (from, to) => {
  let query = supabase.from('tag_queue').select('*');
  if (debounced.value.trim().length > 1) {
    query = query.ilike('artist_dir', `%${debounced.value.trim()}%`);
  }
  query =
    sort.value === 'shortest'
      ? // Nulls last: puratan carries no slot, and an unknown length is a
        // worse bet than a known short one.
        query
          .order('est_seconds', { ascending: true, nullsFirst: false })
          .order('segments', { ascending: true })
      : query
          .order('segments', { ascending: true })
          .order('est_seconds', { ascending: true, nullsFirst: false });
  const { data } = await query.range(from, to);
  return data;
});
await list.loadMore();

watchDebounced(
  [debounced, sort],
  () => {
    list.reset();
    list.loadMore();
  },
  { debounce: 50 }
);

function mins(sec: number | null) {
  return sec ? `${Math.round(sec / 60)} min` : '—';
}
</script>

<template>
  <div>
    <h1 class="mb-1 text-xl font-semibold">Tag queue</h1>
    <p class="mb-4 text-sm text-muted-foreground">
      Mark where each shabad starts and ends. Name is all that's required.
    </p>

    <div class="mb-4 flex flex-wrap gap-2">
      <input
        v-model="q"
        type="search"
        placeholder="Filter by artist…"
        class="min-w-56 flex-1 rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring"
      />
      <div class="flex overflow-hidden rounded-md border border-input">
        <button
          v-for="opt in [
            { key: 'shortest', label: 'Shortest first', icon: Clock },
            { key: 'untagged', label: 'Least tagged', icon: Layers },
          ]"
          :key="opt.key"
          class="flex items-center gap-2 px-3 py-2 text-sm transition"
          :class="
            sort === opt.key
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="sort = opt.key as any"
        >
          <component :is="opt.icon" class="size-3.5" />
          {{ opt.label }}
        </button>
      </div>
    </div>

    <NuxtLink
      v-for="t in list.items.value"
      :key="t.id"
      :to="`/tag/${t.id}`"
      class="flex items-center gap-3 rounded-md px-3 py-2.5 transition hover:bg-accent"
    >
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm">{{
          t.title ?? t.raw_filename
        }}</span>
        <span class="block truncate text-xs text-muted-foreground">
          {{ [t.artist_dir, t.date].filter(Boolean).join(' · ') }}
        </span>
      </span>
      <span
        v-if="t.segments"
        class="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] text-muted-foreground"
      >
        {{ t.published }}/{{ t.segments }} published
      </span>
      <span
        class="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground"
      >
        {{ mins(t.est_seconds) }}
      </span>
    </NuxtLink>

    <InfiniteScroll
      :loading="list.loading.value"
      :done="list.done.value"
      @more="list.loadMore"
    />
  </div>
</template>
