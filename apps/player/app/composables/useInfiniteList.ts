/**
 * Paged list with infinite scroll.
 *
 * The archive is large enough that no page should fetch it whole — an artist
 * can have hundreds of shabads once tagged, and the tag queue is 42k rows.
 */
import { ref, shallowRef } from 'vue';

const PAGE = 50;

export function useInfiniteList<T>(
  fetchPage: (from: number, to: number) => Promise<T[] | null>
) {
  const items = shallowRef<T[]>([]);
  const loading = ref(false);
  const done = ref(false);

  // Bumped by reset(). A page that resolves after its query was superseded —
  // the user retyped a filter or flipped the sort mid-flight — is discarded
  // rather than appended, which would otherwise render the old query's rows
  // under the new query's heading.
  let generation = 0;

  async function loadMore() {
    if (loading.value || done.value) return;
    const mine = generation;
    loading.value = true;
    try {
      const from = items.value.length;
      const page = (await fetchPage(from, from + PAGE - 1)) ?? [];
      if (mine !== generation) return;
      items.value = [...items.value, ...page];
      // A short page means the source is exhausted; without this the sentinel
      // fires forever against an empty tail.
      if (page.length < PAGE) done.value = true;
    } finally {
      // Only the current generation owns the flag — a stale request clearing
      // it would race the fresh one that reset() already started.
      if (mine === generation) loading.value = false;
    }
  }

  function reset() {
    generation += 1;
    items.value = [];
    done.value = false;
    // Cleared here too: reset() is followed immediately by loadMore(), which
    // returns early while this is true, silently dropping the new query.
    loading.value = false;
  }

  return { items, loading, done, loadMore, reset };
}
