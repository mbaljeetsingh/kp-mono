/**
 * Paged list with infinite scroll.
 *
 * The archive is large enough that no page should ever fetch it whole — an
 * artist can have hundreds of shabads once tagged, and puratan alone is a
 * thousand files. Pages load as the listener scrolls instead.
 */
import { ref, shallowRef } from 'vue';

const PAGE = 50;

export function useInfiniteList<T>(
  fetchPage: (from: number, to: number) => Promise<T[] | null>
) {
  const items = shallowRef<T[]>([]);
  const loading = ref(false);
  const done = ref(false);

  async function loadMore() {
    if (loading.value || done.value) return;
    loading.value = true;
    const from = items.value.length;
    const page = (await fetchPage(from, from + PAGE - 1)) ?? [];
    items.value = [...items.value, ...page];
    // A short page means the source is exhausted; without this the sentinel
    // would keep firing against an empty tail forever.
    if (page.length < PAGE) done.value = true;
    loading.value = false;
  }

  function reset() {
    items.value = [];
    done.value = false;
  }

  return { items, loading, done, loadMore, reset };
}
