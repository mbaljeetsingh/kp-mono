/**
 * Raag list for autocomplete, from np-mono's curated dataset.
 *
 * Typed free-hand, the same raag arrives as "Asa", "Aasa" and "Āsā" and the
 * facet stops being a facet. A fixed vocabulary is the whole point.
 *
 * Most segments should never need this: linking a BaniDB shabad fills the raag
 * automatically, because a shabad's raag is a property of the shabad itself.
 * This is for the cases where no shabad is linked, or where the rendition is
 * genuinely in a different raag from the one it is written under.
 */
import ragas from '@kp/shared/data/ragas.json';

export interface Raga {
  id: string;
  name: string;
  category: string;
}

export function useRagas() {
  const all = (ragas as Raga[]).map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
  }));

  function search(term: string, limit = 8): Raga[] {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    const starts: Raga[] = [];
    const contains: Raga[] = [];
    for (const r of all) {
      const n = r.name.toLowerCase();
      if (n.startsWith(q)) starts.push(r);
      else if (n.includes(q)) contains.push(r);
    }
    // Prefix matches first — typing "asa" should surface Asa before Bilaval Asa.
    return [...starts, ...contains].slice(0, limit);
  }

  return { all, search };
}
