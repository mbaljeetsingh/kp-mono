<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Input } from '@/components/ui/input';
import { SELECTED_SEGMENT } from '@/lib/segmented';
import { Clock, Layers, Sparkles } from 'lucide-vue-next';

const supabase = useSupabaseClient();
const route = useRoute();
const router = useRouter();

type Sort = 'shortest' | 'untagged';
type Filter = 'todo' | 'started' | 'done' | 'all';

const SORTS: Sort[] = ['shortest', 'untagged'];
const FILTERS: Filter[] = ['todo', 'started', 'done', 'all'];

/**
 * Which shelf you are looking at belongs to the URL, not to this component.
 *
 * Tagging is a loop of open a recording, mark it, come back for the next one —
 * and coming back is the browser's Back button. Held in component state, the
 * selection dies when the route changes and Back lands everybody on
 * "Not started, shortest first" no matter which shelf they were working
 * through. Reading it from the query means the restored URL restores the view.
 */
function fromQuery<T extends string>(
  key: string,
  allowed: T[],
  fallback: T
): T {
  const value = route.query[key];
  return allowed.includes(value as T) ? (value as T) : fallback;
}

const q = ref(typeof route.query.artist === 'string' ? route.query.artist : '');
const debounced = refDebounced(q, 300);

// Shortest-first is the default because a recording a volunteer can finish in
// one sitting is worth more than a longer one they abandon halfway.
const sort = ref<Sort>(fromQuery('sort', SORTS, 'shortest'));

// Without this the same finished recordings sit at the top of the list
// forever and there is no way to tell what is left.
const filter = ref<Filter>(fromQuery('filter', FILTERS, 'todo'));

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
    // `replace`, not `push`: picking a shelf is choosing what this one page
    // shows, and pushing would make Back walk backwards through every filter
    // click instead of leaving the list. Defaults stay out of the URL so the
    // plain `/` a tagger bookmarks keeps meaning "whatever the default is".
    const query: Record<string, string> = {};
    if (filter.value !== 'todo') query.filter = filter.value;
    if (sort.value !== 'shortest') query.sort = sort.value;
    if (debounced.value.trim()) query.artist = debounced.value.trim();
    router.replace({ query });

    list.reset();
    list.loadMore();
  },
  { debounce: 50 }
);

function mins(sec: number | null) {
  return sec ? `${Math.round(sec / 60)} min` : '—';
}

// The scan queue, keyed by track so each row can tell whether it may still
// ask. Fetched once rather than joined into the recordings view: the table is
// small — one row per request, ever — and a second query keeps the view SQL
// untouched. For anyone without the propose permission RLS returns nothing,
// so the map stays empty and a click gets the refusal as an error instead.
const { data: scans } = await useAsyncData('scan-requests', async () => {
  const { data } = await supabase
    .from('scan_requests')
    .select('track_id,done_at');
  const map: Record<string, string | null> = {};
  for (const r of data ?? []) map[r.track_id] = r.done_at;
  return map;
});

/**
 * 'none' shows the button, 'queued' the waiting state, and 'done' the button
 * again in its re-request form — a finished scan is an answer, not a dead
 * end, and yesterday's "nothing found" is worth re-asking after the matcher
 * improves. The suggestions themselves, if any, sit on the track as
 * renditions.
 */
function scanState(id: string): 'none' | 'queued' | 'done' {
  const m = scans.value;
  if (!m || !(id in m)) return 'none';
  return m[id] === null ? 'queued' : 'done';
}

const suggestBusy = ref<string | null>(null);
const suggestError = ref('');

async function suggest(t: any) {
  suggestError.value = '';
  suggestBusy.value = t.id;
  // Upsert, not insert: the same call requests a first scan AND re-requests
  // one whose earlier run is done (matcher improved, or it found nothing) —
  // clearing done_at puts the track back in the queue. It also makes a race
  // benign: two taggers pressing Suggest both land on "queued" instead of the
  // loser reading a duplicate-key error for a state that isn't an error.
  // The INSERT policy does not default requested_by, so it is set from the
  // session; a missing propose permission still refuses outright.
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase.from('scan_requests').upsert({
    track_id: t.id,
    requested_by: user.user?.id,
    requested_at: new Date().toISOString(),
    done_at: null,
  });
  suggestBusy.value = null;
  if (error) {
    suggestError.value = `Couldn't request suggestions: ${error.message}`;
    return;
  }
  if (scans.value) scans.value[t.id] = null;
}
</script>

<template>
  <div>
    <h1 class="mb-1 text-xl font-semibold">Recordings</h1>
    <p class="mb-4 text-sm text-muted-foreground">
      Mark where each shabad starts and ends. A name is all that's required.
    </p>

    <ButtonGroup class="mb-3" aria-label="Filter recordings">
      <Button
        v-for="f in [
          { key: 'todo', label: 'Not started' },
          { key: 'started', label: 'In progress' },
          { key: 'done', label: 'Has published' },
          { key: 'all', label: 'All' },
        ]"
        :key="f.key"
        size="sm"
        variant="outline"
        :aria-pressed="filter === f.key"
        :class="['text-xs', SELECTED_SEGMENT]"
        @click="filter = f.key as any"
      >
        {{ f.label }}
      </Button>
    </ButtonGroup>

    <div class="mb-4 flex flex-wrap gap-2">
      <Input
        v-model="q"
        type="search"
        placeholder="Filter by artist…"
        class="min-w-56 flex-1 bg-card"
      />
      <ButtonGroup aria-label="Sort recordings">
        <Button
          v-for="opt in [
            { key: 'shortest', label: 'Shortest first', icon: Clock },
            { key: 'untagged', label: 'Least tagged', icon: Layers },
          ]"
          :key="opt.key"
          variant="outline"
          :aria-pressed="sort === opt.key"
          :class="SELECTED_SEGMENT"
          @click="sort = opt.key as any"
        >
          <component :is="opt.icon" class="size-3.5" />
          {{ opt.label }}
        </Button>
      </ButtonGroup>
    </div>

    <p v-if="suggestError" class="mb-2 text-xs text-amber-400">
      {{ suggestError }}
    </p>

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
      <!-- A quiet side door: ask the nightly scan to draft shabad boundaries
           for this recording. Secondary on purpose — tagging by ear stays the
           main act — and the row is a link, so the click must not navigate. -->
      <Button
        v-if="scanState(t.id) === 'none'"
        variant="ghost"
        size="sm"
        class="h-7 shrink-0 px-2 text-[11px] text-muted-foreground"
        :disabled="suggestBusy === t.id"
        title="Ask the nightly scan for shabad suggestions — they arrive overnight"
        @click.stop.prevent="suggest(t)"
      >
        <Sparkles class="size-3.5" /> Suggest
      </Button>
      <span
        v-else-if="scanState(t.id) === 'queued'"
        class="shrink-0 text-[11px] text-muted-foreground/70"
        title="Suggestions arrive overnight"
      >
        queued
      </span>
      <Button
        v-else
        variant="ghost"
        size="sm"
        class="h-7 shrink-0 px-2 text-[11px] text-muted-foreground/70"
        :disabled="suggestBusy === t.id"
        title="Scanned already — ask again (the scanner may have improved since)"
        @click.stop.prevent="suggest(t)"
      >
        <Sparkles class="size-3.5" /> Suggest again
      </Button>
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
