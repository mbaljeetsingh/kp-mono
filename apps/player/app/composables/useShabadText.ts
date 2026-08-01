/**
 * Shabad text from BaniDB, for read-along.
 *
 * Goes through `banidbApiBaseUrl` rather than the api host directly: in dev
 * that is a same-origin proxy, because BaniDB caches its allow-origin header
 * across ports (see nuxt.config routeRules). Cached per shabad id for the
 * session too: the same shabad recurs constantly across renditions, and
 * re-fetching it on every play would be both slow and rude.
 */
const cache = new Map<number, any>();

export function useShabadText() {
  const base = useRuntimeConfig().public.banidbApiBaseUrl;
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
      const res = await fetch(`${base}/shabads/${shabadId}`);
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
