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
 * Ordered by how related the suggestion is: the same ragi first, then the same
 * raag, then whatever is newest. Each group is only offered if it has anything
 * the ones above it did not already name.
 */
import { computed, ref, watch } from 'vue';
import { usePlayer, type Playable } from '~/composables/usePlayer';

/** Per group. Enough to be worth a heading, few enough to stay a shelf. */
const PER_GROUP = 4;

export interface SuggestionGroup {
  label: string;
  items: any[];
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
      const seen = new Set<string>(current ? [current.id] : []);
      const next: SuggestionGroup[] = [];

      /** One query, minus anything an earlier group already offered. */
      async function take(
        label: string,
        build: (q: any) => any
      ): Promise<void> {
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
        next.push({ label, items: rows });
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
      if (!next.length) {
        await take('Recently added', (q) =>
          q.order('created_at', { ascending: false })
        );
      }

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
