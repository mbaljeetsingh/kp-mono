/**
 * Shabad text from BaniDB, for read-along.
 *
 * Fetched from the browser — BaniDB reflects any Origin, so no proxy is
 * needed. Cached per shabad id for the session: the same shabad recurs
 * constantly across renditions, and re-fetching it on every play would be
 * both slow and rude.
 */
const cache = new Map<number, any>();

export function useShabadText() {
  const loading = ref(false);
  const shabad = ref<any | null>(null);

  async function load(shabadId: number | null | undefined) {
    if (!shabadId) {
      shabad.value = null;
      return;
    }
    if (cache.has(shabadId)) {
      shabad.value = cache.get(shabadId);
      return;
    }
    loading.value = true;
    try {
      const res = await fetch(`https://api.banidb.com/v2/shabads/${shabadId}`);
      const json = await res.json();
      cache.set(shabadId, json);
      shabad.value = json;
    } catch {
      shabad.value = null;
    } finally {
      loading.value = false;
    }
  }

  return { shabad, loading, load };
}
