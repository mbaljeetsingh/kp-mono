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
    if (page.length < PAGE) done.value = true;
    loading.value = false;
  }

  function reset() {
    items.value = [];
    done.value = false;
  }

  return { items, loading, done, loadMore, reset };
}
