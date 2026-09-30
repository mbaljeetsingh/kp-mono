/**
 * Name the shabad from the filename, for recordings that are one shabad end to end.
 *
 * Puratan filenames are the shabad's first line in loose roman, so BaniDB's
 * romanized search can usually find the exact shabad before anyone presses
 * play. This is only a guess, though. A wrong match would put a mislabeled
 * shabad straight into the player, so the page pre-selects it but never saves
 * it on its own.
 */
import { searchBaniDb, type BaniDbHit } from '@kp/api';
import { useQuery } from '@tanstack/react-query';

import { BANIDB_BASE } from '~/lib/links';

/** The filename is the identifier when a recording has no title, but nobody calls it by its extension. */
export function recordingHeading(r: {
  title?: string | null;
  raw_filename?: string | null;
  id: string;
}) {
  return (r.title ?? r.raw_filename ?? r.id).replace(/\.(mp3|m4a|ogg|wav)$/i, '');
}

/**
 * What to ask BaniDB, best guess first. The whole cleaned title comes first,
 * because a real first line can contain a hyphen. The part after a " - " is
 * only a fallback, for filenames written as "Bhai … - line". The "[1]"
 * duplicate marker is dropped either way.
 */
export function titleCandidates(heading: string): string[] {
  const s = heading
    .replace(/\[\d+\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const out = [s];
  const parts = s.split(/\s+-\s+/);
  const last = parts[parts.length - 1]?.trim();
  if (parts.length > 1 && last) out.push(last);
  return out.filter((c) => c.length >= 3);
}

/**
 * The best few BaniDB hits for the heading, or an empty list.
 *
 * Search type 4 is BaniDB's romanized search. It takes whole transliterated
 * words and forgives spelling ("vapar karo vaparee" finds "vaapaar karahu
 * vaapaaree"), which is the register these filenames are written in.
 */
export function useTitleMatches(heading: string, enabled: boolean) {
  return useQuery({
    queryKey: ['banidb', 'title-match', heading],
    queryFn: async (): Promise<BaniDbHit[]> => {
      for (const q of titleCandidates(heading)) {
        const hits = await searchBaniDb(BANIDB_BASE, q, 4);
        if (hits.length) return hits.slice(0, 6);
      }
      return [];
    },
    enabled: enabled && heading.length > 0,
    // 'static' so the auth recovery's invalidation (useAuth) leaves it alone:
    // BaniDB never saw the Supabase token, and a refetch could swap the shabad
    // pre-linked under the tagger.
    staleTime: 'static',
    retry: 1,
  });
}
