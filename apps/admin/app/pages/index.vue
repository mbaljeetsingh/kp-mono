<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Input } from '@/components/ui/input';
import { SELECTED_SEGMENT } from '@/lib/segmented';
import { DONE_SLACK_SECONDS, coverageOpen } from '@/lib/tagging';
import { Clock, Layers, Sparkles, ListMusic } from 'lucide-vue-next';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

const supabase = useSupabaseClient();
const route = useRoute();
const router = useRouter();

type Sort = 'shortest' | 'untagged';
type Filter = 'todo' | 'queued' | 'started' | 'done' | 'all';

const SORTS: Sort[] = ['shortest', 'untagged'];
const FILTERS: Filter[] = ['todo', 'queued', 'started', 'done', 'all'];

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

// Two characters is too short to be a search — it would match most of the
// archive and cost a scan to say so.
const searchTerm = computed(() => {
  const t = debounced.value.trim();
  return t.length > 1 ? t : '';
});

// The scan queue, keyed by track so each row can tell whether it may still
// ask. Fetched once rather than joined into the recordings view: the table is
// small — one row per request, ever — and a second query keeps the view SQL
// untouched. For anyone without the scans.request permission RLS returns nothing,
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
 * Ids the Queued shelf will ask for at once. ~19 bytes each in the query
 * string, so this stays far inside the 8 KB a proxy will usually carry.
 */
const QUEUED_SHELF_MAX = 200;

/** Tracks with a scan requested and not yet finished — the "Queued" shelf. */
const queuedIds = computed(() =>
  Object.entries(scans.value ?? {})
    .filter(([, doneAt]) => doneAt === null)
    .map(([trackId]) => trackId)
);

function applyShelf(query: any) {
  if (filter.value === 'todo') return query.eq('renditions', 0);
  // "Done" demands coverage, not just a published row: two shabads published
  // out of a 70-minute set is a recording somebody started, and it has to
  // keep showing up where the next tagger looks for unfinished work. A
  // tagger's mark that the rest is not shabads (tagged_done_at) overrides the
  // coverage measure — announcements and simran are minutes no amount of
  // tagging will ever cover. NULL untagged_seconds means the length is
  // unknowable (no filename slot), and unknown reads as still-open — these
  // two arms must stay exact complements of each other or a recording lands
  // on both shelves, or on neither (see coverageOpen, the same predicate in
  // TS).
  if (filter.value === 'started')
    return query
      .gt('renditions', 0)
      .or(
        `published.eq.0,and(tagged_done_at.is.null,or(untagged_seconds.gt.${DONE_SLACK_SECONDS},untagged_seconds.is.null))`
      );
  if (filter.value === 'done')
    return query
      .gt('published', 0)
      .or(
        `untagged_seconds.lte.${DONE_SLACK_SECONDS},tagged_done_at.not.is.null`
      );
  // Waiting on the scanner. Unlike the other shelves this is not a column on
  // the view — the queue is its own table — so it filters by the ids awaiting a
  // scan. An empty list needs no special case: PostgREST answers `in.()` with
  // no rows, which is the right answer for an empty queue (measured, not
  // assumed).
  //
  // Capped because the list rides in the query string and the queue is only
  // self-limiting while the scanner is healthy: every id it stamps leaves the
  // queue, so a scanner that fails on every track — which is what a missing
  // ffmpeg did — lets requests pile up until the URL is too long to send, and
  // this shelf breaks exactly when someone opens it to ask why.
  if (filter.value === 'queued') {
    return query.in('id', queuedIds.value.slice(0, QUEUED_SHELF_MAX));
  }
  return query;
}

/**
 * The filename as well as the artist: `title` is null for almost every
 * recording, so the filename is the only place the date and the slot
 * ("5.35pm to 6.10pm") are written — and that is how a tagger looks for the one
 * recording somebody asked them about.
 *
 * Commas and parentheses have to go — they delimit PostgREST's `or` list — and
 * they become wildcards rather than spaces, because a space is a character the
 * filename would then have to match in that exact position. Real filenames are
 * full of parentheses ("(5.35pm to 6.10pm)"), so pasting one in has to keep
 * working; every other character, dots included, is safe inside a value.
 */
function applySearch(query: any) {
  const term = searchTerm.value;
  if (!term) return query;
  const safe = term.replace(/[(),]/g, '*');
  return query.or(`artist_dir.ilike.*${safe}*,raw_filename.ilike.*${safe}*`);
}

/**
 * How many recordings this shelf holds, which the infinite list cannot say:
 * it only knows what it has scrolled to. Same filters as the query below and
 * nothing else — `head: true` asks Postgres to count without shipping a single
 * row, so the answer costs no bandwidth against a 49,000-track catalogue.
 */
const { data: total, refresh: refreshTotal } = await useAsyncData(
  'recordings-count',
  async () => {
    const { count } = await applySearch(
      applyShelf(
        supabase.from('recordings').select('*', { count: 'exact', head: true })
      )
    );
    return count ?? 0;
  }
);

const list = useInfiniteList<any>(async (from, to) => {
  // Same shelf and same search as the count above, from one definition each —
  // a header that disagrees with the list under it is worse than no header.
  let query = applySearch(applyShelf(supabase.from('recordings').select('*')));
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
    refreshTotal();
  },
  { debounce: 50 }
);

// Each shelf means something different when it is empty, and "no results" would
// throw away the only encouraging message this page has: a clear todo shelf is
// the goal of the whole exercise.
const SHELF_EMPTY: Record<string, [string, string]> = {
  todo: [
    'Every recording has been started',
    'Nothing is untouched. Check "In progress" for recordings with minutes left to tag or shabads waiting to be published.',
  ],
  queued: [
    'Nothing waiting on the scanner',
    'Press Suggest on a recording and it appears here until the nightly scan has had its turn.',
  ],
  started: [
    'Nothing in progress',
    'No recording has minutes left to tag or shabads waiting to publish. Start one from "Not started".',
  ],
  done: [
    'Nothing done yet',
    'A recording lands here once shabads are published and nothing sizeable is left untagged — or a tagger marks it fully tagged.',
  ],
  all: [
    'No recordings',
    'The catalogue is empty — the crawler has not seeded any tracks yet.',
  ],
};
const shelfEmptyTitle = computed(
  () => SHELF_EMPTY[filter.value]?.[0] ?? 'Nothing here'
);
const shelfEmptyHint = computed(() => SHELF_EMPTY[filter.value]?.[1] ?? '');

/** One button out of any dead end, whichever combination produced it. */
function showEverything() {
  q.value = '';
  filter.value = 'all';
}

// From the published slot, not the file: the two routinely disagree by
// minutes, so it is marked as the estimate it is — the same ≈ the detail page
// shows until the audio's own metadata arrives.
function mins(sec: number | null) {
  return sec ? `≈${Math.round(sec / 60)} min` : '—';
}

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

// Requesting a scan is admin-only (see 20260826000100). RLS refuses it either
// way; hiding the control keeps the list from offering an action that would
// only come back as an error.
const { canRequestScans } = await useMyPermissions();

const suggestBusy = ref<string | null>(null);
/**
 * Keyed by track, because a refusal belongs to the row that earned it. A single
 * page-level line put "couldn't request suggestions" at the top of a list the
 * tagger had scrolled a long way down, next to no row in particular.
 */
const suggestError = ref<Record<string, string>>({});

async function suggest(t: any) {
  delete suggestError.value[t.id];
  suggestBusy.value = t.id;
  // Upsert, not insert: the same call requests a first scan AND re-requests
  // one whose earlier run is done (matcher improved, or it found nothing) —
  // clearing done_at puts the track back in the queue. It also makes a race
  // benign: two taggers pressing Suggest both land on "queued" instead of the
  // loser reading a duplicate-key error for a state that isn't an error.
  // The INSERT policy does not default requested_by, so it is set from the
  // session; a missing scans.request permission still refuses outright.
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase.from('scan_requests').upsert({
    track_id: t.id,
    requested_by: user.user?.id,
    requested_at: new Date().toISOString(),
    done_at: null,
  });
  suggestBusy.value = null;
  if (error) {
    suggestError.value[t.id] = `Couldn't request suggestions: ${error.message}`;
    return;
  }
  if (scans.value) scans.value[t.id] = null;
}
</script>

<template>
  <div>
    <!-- The count sits with the heading, as it does on Users. It is the shelf's
         size, not the scroll position: the list below loads a page at a time and
         has no idea how much is behind it. -->
    <h1 class="mb-1 text-xl font-semibold">
      Recordings
      <span class="text-sm font-normal text-muted-foreground">
        ({{ (total ?? 0).toLocaleString() }})
      </span>
    </h1>
    <p class="mb-4 text-sm text-muted-foreground">
      Mark where each shabad starts and ends. A name is all that's required.
    </p>

    <ButtonGroup class="mb-3" aria-label="Filter recordings">
      <Button
        v-for="f in [
          { key: 'todo', label: 'Not started' },
          { key: 'queued', label: 'Queued' },
          { key: 'started', label: 'In progress' },
          { key: 'done', label: 'Done' },
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
        placeholder="Filter by artist, or search the filename…"
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

    <div v-for="t in list.items.value" :key="t.id">
      <NuxtLink
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
          v-if="canRequestScans && scanState(t.id) === 'none'"
          variant="ghost"
          size="sm"
          class="h-7 shrink-0 px-2 text-[11px] text-muted-foreground"
          :disabled="suggestBusy === t.id"
          :aria-label="`Ask the nightly scan to suggest shabads for ${t.raw_filename}`"
          title="Ask the nightly scan for shabad suggestions — they arrive overnight"
          @click.stop.prevent="suggest(t)"
        >
          <Sparkles class="size-3.5" /> Suggest
        </Button>
        <span
          v-else-if="canRequestScans && scanState(t.id) === 'queued'"
          class="shrink-0 text-[11px] text-muted-foreground/70"
          title="Suggestions arrive overnight"
        >
          queued
        </span>
        <Button
          v-else-if="canRequestScans"
          variant="ghost"
          size="sm"
          class="h-7 shrink-0 px-2 text-[11px] text-muted-foreground/70"
          :disabled="suggestBusy === t.id"
          :aria-label="`Scan ${t.raw_filename} again`"
          title="Scanned already — ask again (the scanner may have improved since)"
          @click.stop.prevent="suggest(t)"
        >
          <Sparkles class="size-3.5" /> Suggest again
        </Button>
        <!-- The other half of "is it finished?": rows count published work,
             this says how much of the recording the work covers. Amber like a
             pending publish — both mean the same thing, someone has to come
             back. -->
        <span
          v-if="
            t.renditions &&
            coverageOpen(t.untagged_seconds) &&
            !t.tagged_done_at
          "
          class="hidden shrink-0 text-[11px] text-amber-400/80 sm:block"
          :title="
            t.untagged_seconds === null
              ? 'This recording has no slot in its filename, so nothing can measure what is left — a tagger has to say when it is done'
              : `Roughly ${Math.round(t.untagged_seconds / 60)} minutes have no tagged shabad yet`
          "
        >
          {{
            t.untagged_seconds === null
              ? 'length unknown'
              : `~${Math.round(t.untagged_seconds / 60)} min untagged`
          }}
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
      <p
        v-if="suggestError[t.id]"
        class="px-3 pb-2 pl-14 text-[11px] text-amber-400"
        role="alert"
      >
        {{ suggestError[t.id] }}
      </p>
    </div>

    <!-- The default shelf is "Not started", so an empty list here is the good
         news that the shelf is clear — not a dead end. It says which, and
         offers the way to the rest. -->
    <Empty
      v-if="!list.items.value.length && !list.loading.value"
      class="gap-4 rounded-lg border border-dashed p-8 md:p-8"
    >
      <EmptyHeader>
        <EmptyMedia variant="icon"><ListMusic /></EmptyMedia>
        <EmptyTitle>
          {{ searchTerm ? 'Nothing matches that' : shelfEmptyTitle }}
        </EmptyTitle>
        <EmptyDescription>
          {{
            searchTerm
              ? 'Try part of an artist’s name, or a date as it appears in the filename.'
              : shelfEmptyHint
          }}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent v-if="searchTerm || filter !== 'all'">
        <Button variant="outline" size="sm" @click="showEverything">
          Show all recordings
        </Button>
      </EmptyContent>
    </Empty>

    <InfiniteScroll
      :loading="list.loading.value"
      :done="list.done.value"
      @more="list.loadMore"
    />

    <!-- 49,000 recordings means a list that ends is worth confirming: without
         this, the bottom of the last page is indistinguishable from a page that
         has not loaded yet. -->
    <p
      v-if="list.done.value && list.items.value.length"
      class="py-4 text-center text-[11px] text-muted-foreground/70"
    >
      That’s all {{ list.items.value.length }} on this shelf.
    </p>
  </div>
</template>
