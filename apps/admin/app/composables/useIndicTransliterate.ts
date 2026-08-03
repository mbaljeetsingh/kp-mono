/**
 * Phonetic Gurmukhi suggestions via the Google Input Tools API — the same
 * typing experience as np-mono's lyrics input, trimmed to what the shabad
 * search needs: one word in, up to a handful of Gurmukhi candidates out.
 *
 * This deliberately replaces the old AnmolLipi key echo rather than
 * supplementing it:
 * per-key mapping made `a` and `A` mean different letters than everywhere
 * else the tagger types Gurmukhi, and its only real consumer — BaniDB's
 * first-letter search — accepts the raw roman keys anyway.
 */
export function useIndicTransliterate() {
  const suggestions = ref<string[]>([]);
  const loading = ref(false);

  let generation = 0;

  async function fetchSuggestions(word: string) {
    const mine = ++generation;
    if (!word || !/[a-zA-Z]/.test(word)) {
      suggestions.value = [];
      return;
    }
    loading.value = true;
    try {
      const url =
        `https://inputtools.google.com/request?text=${encodeURIComponent(word)}` +
        `&itc=pa-t-i0-und&num=6&cp=0&cs=1&ie=utf-8&oe=utf-8&app=demopage`;
      const res = await fetch(url);
      const data = await res.json();
      if (mine !== generation) return;
      // Response shape: ['SUCCESS', [[word, [suggestions], ...]]]
      suggestions.value =
        data?.[0] === 'SUCCESS' ? (data?.[1]?.[0]?.[1] ?? []) : [];
    } catch {
      if (mine === generation) suggestions.value = [];
    } finally {
      if (mine === generation) loading.value = false;
    }
  }

  function clear() {
    generation++;
    suggestions.value = [];
  }

  return { suggestions, loading, fetchSuggestions, clear };
}
