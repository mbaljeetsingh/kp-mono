/**
 * BaniDB's transliteration is academic — doubled vowels, nasal markers, verse
 * bars. Nobody writes a shabad that way: on YouTube, in a diary, or on a
 * programme it appears as "Man Bairagi Ja Sabad Bhau Khai", not
 * "man bairaagee jaa sabadh bhau khai ||".
 *
 * This normalises toward the common spelling so the auto-filled name is one a
 * person would recognise. It is a starting point, not an authority — spellings
 * genuinely vary, so the tagger can always edit what lands in the field.
 */
const RULES: [RegExp, string][] = [
  [/\|\||॥|।/g, ''], // verse bars
  [/\d+/g, ''], // verse numbers
  [/\(n\)/gi, 'n'], // nasal marker: too(n) -> toon
  [/\(nn\)/gi, 'n'],
  [/aa/gi, 'a'], // bairaagee -> bairagi
  [/oo/gi, 'u'], // too -> tu
  [/ee/gi, 'i'], // bairaagee -> bairagi
  [/dh\b/gi, 'd'], // word-final only: sabadh -> sabad, dhan stays
  [/\bth\b/gi, 't'],
  [/\s+/g, ' '],
];

export function prettyShabadName(transliteration: string): string {
  let out = transliteration;
  for (const [pattern, replacement] of RULES)
    out = out.replace(pattern, replacement);
  return (
    out
      .trim()
      // Title case, because that is how these are written everywhere they
      // appear. The rest of each word is lowercased, not left alone: BaniDB
      // capitalises mid-word to mark retroflex and aspirated letters, so
      // "kooR kapaT" arrived as "KuR KapaT" — meaningful in a transliteration
      // scheme, noise in a title. Matching on letter runs rather than splitting
      // on spaces also capitalises after a hyphen ("Ik-Oankar").
      .replace(
        /[\p{L}\p{M}']+/gu,
        (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase()
      )
  );
}
