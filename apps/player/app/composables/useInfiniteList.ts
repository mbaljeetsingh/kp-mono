/**
 * Paged list with infinite scroll.
 *
 * The archive is large enough that no page should fetch it whole — an artist
 * can have hundreds of shabads once tagged, and the tag queue is 42k rows.
 *
 * `key` puts the first page in the Nuxt payload. Without it the list was a
 * plain ref: the server rendered its rows, the client re-ran the same query
 * from empty, and Vue hydrated the server's markup against a list that had
 * not arrived yet. That mismatch does not fail loudly — it walks the node
 * cursor out of step and leaves a row wearing another element's attributes,
 * which is why one row rendered blank.
 */
import { ref } from 'vue';

const PAGE = 50;

export function useInfiniteList<T>(
  key: string,
  fetchPage: (from: number, to: number) => Promise<T[] | null>
) {
  const items = useState<T[]>(`list:${key}:items`, () => []);
  const loading = ref(false);
  // Also serialized: a first page shorter than PAGE means the server already
  // knows the list is complete, and the client must not fetch again to learn
  // what the payload already told it.
  const done = useState<boolean>(`list:${key}:done`, () => false);

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
