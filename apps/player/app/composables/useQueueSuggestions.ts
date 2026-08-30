/**
 * What to put in Up next when nobody has queued anything.
 *
 * The queue is empty almost all of the time — `addToQueue` is a deliberate act
 * and most listening is one shabad at a time — so the panel that exists to show
 * it spent its life saying "Nothing queued." These are suggestions for that
 * space, and deliberately only suggestions: nothing here is queued and nothing
 * plays on its own. A shabad is often put on for its own sake, and continuing
 * into something else unasked is a decision that belongs to the listener, not
 * to the player.
 *
 * `skipToNext` is the one way past that, and it is not a contradiction: it runs
 * only from a press of Next, which is the listener saying "move on" in as many
 * words. The automatic end-of-item advance still stops dead.
 *
 * Ordered by how related the suggestion is: the same ragi first, then the same
 * raag, then whatever is newest. Each group is only offered if it has anything
 * the ones above it did not already name.
 */
import { computed, ref, watch } from 'vue';
import type { SupabaseClient } from '@supabase/supabase-js';
import { usePlayer, toPlayable, type Playable } from '~/composables/usePlayer';

/** Per group. Enough to be worth a heading, few enough to stay a shelf. */
const PER_GROUP = 4;

export interface SuggestionGroup {
  label: string;
  items: any[];
}

/**
 * The last groups fetched, and what they were fetched for.
 *
 * Module level so that a press of Next can reuse what the open panel already
 * asked for rather than repeating the query — and, more to the point, so the
 * skip is instant in the case that matters most: the full player, where the
 * listener can see the suggestion they are about to land on.
 */
let cache: { forId: string; groups: SuggestionGroup[] } | null = null;

/**
 * The query itself, free of any component's state, because two callers need it:
 * the panel below, and `skipToNext`, which runs from the transport bar where
 * the panel is not mounted at all.
 */
export async function fetchSuggestionGroups(
  supabase: SupabaseClient,
  current: Playable | null
): Promise<SuggestionGroup[]> {
  const seen = new Set<string>(current ? [current.id] : []);
  const groups: SuggestionGroup[] = [];

  /** One query, minus anything an earlier group already offered. */
  async function take(label: string, build: (q: any) => any): Promise<void> {
    let q = supabase.from('shabads').select('*');
    q = build(q);
    // Postgrest wants the in-list parenthesised; ids are uuids, so there is
    // nothing here to quote or escape.
    if (seen.size) q = q.not('id', 'in', `(${[...seen].join(',')})`);
    const { data, error } = await q.limit(PER_GROUP);
    if (error) {
      console.error(`suggestions (${label}) failed`, error.message);
      return;
    }
    const rows = data ?? [];
    if (!rows.length) return;
    rows.forEach((r: any) => seen.add(r.id));
    groups.push({ label, items: rows });
  }

  if (current?.artist) {
    await take(`More from ${current.subtitle ?? current.artist}`, (q) =>
      q.eq('artist', current.artist).order('created_at', {
        ascending: false,
      })
    );
  }

  if (current?.raag) {
    await take(`More in ${current.raag}`, (q) =>
      q.eq('raag', current.raag).order('created_at', { ascending: false })
    );
  }

  // Always something, even for a shabad whose ragi and raag have nothing
  // else published under them yet — which, this early in the archive, is
  // most of them.
  if (!groups.length) {
    await take('Recently added', (q) =>
      q.order('created_at', { ascending: false })
    );
  }

  if (current) cache = { forId: current.id, groups };
  return groups;
}

/** Set while a skip is waiting on a fetch — see the guard below. */
let skipping = false;

/**
 * Press Next.
 *
 * The queue is the first answer whenever it has one; this exists for the case
 * that is otherwise a dead end, and used to be a dead button — a single shabad
 * played from search, with Up next showing four suggestions underneath a Next
 * control that could not reach any of them.
 *
 * The group is appended rather than played over the queue, so what was playing
 * stays behind the cursor and Previous still goes back to it — the difference
 * between skipping forward and starting a new list.
 */
export async function skipToNext() {
  const player = usePlayer();
  const current = player.current.value;
  // Still somewhere to go, nothing to suggest past, or a broadcast — all three
  // are the player's own skip, and it already knows what each of them means.
  if (!current || player.isLive.value || player.upNext.value.length) {
    await player.next();
    return;
  }
  // Repeat-all makes the end of the queue a dead end no longer: Next wraps to
  // the top, which `next()` handles. Checked here as well as there, because
  // this branch is reached precisely when Up next is empty — otherwise a skip
  // off the last item would append suggestions and the queue the listener
  // asked to hear on a loop would quietly grow instead.
  if (player.repeatMode.value === 'all' && player.queue.value.length) {
    await player.next();
    return;
  }
  // Only this branch awaits a fetch, and the button does not disable while it
  // runs — so two quick presses on a cold cache would both read the queue as it
  // was and the second would overwrite the first's append, swallowing a press.
  if (skipping) return;
  skipping = true;
  // Resolved before the first await, the way `play()` does it: the Nuxt
  // instance context is gone once execution resumes, and this is the one call
  // here that reads runtime config.
  const supabase = useSupabaseClient();
  try {
    const groups =
      cache?.forId === current.id
        ? cache.groups
        : await fetchSuggestionGroups(supabase, current);
    // The query is not instant, and a listener who thinks the press did
    // nothing will click a row rather than wait. Without this, the fetch lands
    // afterwards and drags them off the shabad they just chose onto a
    // suggestion for one they are no longer playing — the same stale-result
    // race the panel keeps its `generation` counter for.
    if (player.current.value?.id !== current.id) return;
    const items = (groups[0]?.items ?? []).map(toPlayable);
    // Nothing to suggest — a failed query, or an archive with nothing else in
    // it — so stop at the end of the queue, exactly as this did before.
    if (!items.length) {
      await player.next();
      return;
    }
    // A suggestion can name something already behind the cursor — "More from
    // this ragi", after playing that ragi's page to the end, is the ordinary
    // case rather than the exotic one. The queue is addressed by id, and
    // `playFromQueue` takes the FIRST match, so leaving both copies in would
    // send a click on that row in Up next backwards to the earlier one and
    // refill Up next with everything since. Drop the stale copy instead; what
    // is playing is never among them, the suggestions having excluded it.
    const fresh = new Set(items.map((i) => i.id));
    const history = player.queue.value.filter((q) => !fresh.has(q.id));
    // Everything else already played is carried across unchanged and the cursor
    // lands on the first new item, which is what makes this a skip rather than
    // a fresh list.
    await player.playList([...history, ...items], history.length);
  } finally {
    skipping = false;
  }
}

export function useQueueSuggestions() {
  const player = usePlayer();
  const supabase = useSupabaseClient();

  const groups = ref<SuggestionGroup[]>([]);
  const loading = ref(false);

  /**
   * Only worth fetching when the queue is actually empty. A broadcast is
   * excluded outright: it has no end to suggest past, and the forty stations
   * are a directory rather than a thing to follow with a shabad.
   */
  const wanted = computed(
    () => !player.isLive.value && player.upNext.value.length === 0
  );

  /**
   * Bumped per run, so a fetch that resolves after the track moved on is
   * discarded rather than rendered under the new shabad's heading — the same
   * guard `useInfiniteList` keeps, and for the same reason.
   */
  let generation = 0;

  async function fetchFor(current: Playable | null) {
    const mine = ++generation;
    loading.value = true;
    try {
      const next = await fetchSuggestionGroups(supabase, current);
      if (mine !== generation) return;
      groups.value = next;
    } finally {
      if (mine === generation) loading.value = false;
    }
  }

  // Re-run when the queue empties or the shabad changes. `immediate` because
  // the panel is mounted already-open inside both full players.
  watch(
    [wanted, () => player.current.value?.id],
    () => {
      if (!wanted.value) {
        // Bumped so a fetch already in flight cannot land after the listener
        // queued something and overwrite a real queue with suggestions.
        generation += 1;
        groups.value = [];
        return;
      }
      void fetchFor(player.current.value ?? null);
    },
    { immediate: true }
  );

  return { groups, loading };
}
