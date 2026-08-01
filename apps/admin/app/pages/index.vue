<script setup lang="ts">
import { Clock, Layers } from 'lucide-vue-next';

const supabase = useSupabaseClient();
const q = ref('');
const debounced = refDebounced(q, 300);

// Shortest-first is the default because a recording a volunteer can finish in
// one sitting is worth more than a longer one they abandon halfway.
const sort = ref<'shortest' | 'untagged'>('shortest');

// Without this the same finished recordings sit at the top of the list
// forever and there is no way to tell what is left.
const filter = ref<'todo' | 'started' | 'done' | 'all'>('todo');

const list = useInfiniteList<any>(async (from, to) => {
  let query = supabase.from('recordings').select('*');
  if (filter.value === 'todo') query = query.eq('renditions', 0);
  else if (filter.value === 'started')
    query = query.gt('renditions', 0).eq('published', 0);
  else if (filter.value === 'done') query = query.gt('published', 0);
  if (debounced.value.trim().length > 1) {
    query = query.ilike('artist_dir', `%${debounced.value.trim()}%`);
  }
  query =
    sort.value === 'shortest'
      ? // Nulls last: puratan carries no slot, and an unknown length is a
        // worse bet than a known short one.
        query
          .order('est_seconds', { ascending: true, nullsFirst: false })
          .order('renditions', { ascending: true })
      : query
          .order('renditions', { ascending: true })
          .order('est_seconds', { ascending: true, nullsFirst: false });
  const { data } = await query.range(from, to);
  return data;
});
await list.loadMore();

watchDebounced(
  [debounced, sort, filter],
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
    <h1 class="mb-1 text-xl font-semibold">Recordings</h1>
    <p class="mb-4 text-sm text-muted-foreground">
      Mark where each shabad starts and ends. A name is all that's required.
    </p>

    <div class="mb-3 flex flex-wrap gap-1">
      <button
        v-for="f in [
          { key: 'todo', label: 'Not started' },
          { key: 'started', label: 'In progress' },
          { key: 'done', label: 'Has published' },
          { key: 'all', label: 'All' },
        ]"
        :key="f.key"
        class="rounded-md px-3 py-1.5 text-xs transition"
        :class="
          filter === f.key
            ? 'bg-accent text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="filter = f.key as any"
      >
        {{ f.label }}
      </button>
    </div>

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
      <ArtTile
        :name="t.artist_dir ?? t.raw_filename"
        :photo="t.artist_photo"
        class="size-9"
      />
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm">{{
          t.title ?? t.raw_filename
        }}</span>
        <span class="block truncate text-xs text-muted-foreground">
          {{ [t.artist_dir, t.date].filter(Boolean).join(' · ') }}
        </span>
      </span>
      <span
        v-if="t.renditions"
        class="shrink-0 rounded-full px-2 py-0.5 text-[11px]"
        :class="
          t.published === t.renditions
            ? 'bg-emerald-500/15 text-emerald-400'
            : 'bg-amber-500/15 text-amber-400'
        "
      >
        {{ t.published }}/{{ t.renditions }} published
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
