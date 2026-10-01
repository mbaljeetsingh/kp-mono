/**
 * A shabad name a person would recognise.
 *
 * BaniDB's transliteration is academic — doubled vowels, nasal markers, verse
 * bars. Nobody writes a shabad that way: on YouTube, in a diary, or on a
 * programme it appears as "Man Bairagi Ja Sabad Bhau Khai", not
 * "man bairaagee jaa sabadh bhau khai ||".
 *
 * This normalises toward the common spelling. With a shabad linked it is the
 * name, not a suggestion: the workbench stopped offering a field to type one
 * (#77), because a typed name could drift from the Gurmukhi beside it. So a
 * spelling worth fixing is fixed here, once, for every rendition — and in
 * packages/aligner/names.py, which the scanner and fill_names.py use, and
 * which shabad-name.cases.json holds to the same answers.
 */
const RULES: [RegExp, string][] = [
  // The rahao marker, and the second one. It labels the line in the book; a
  // title that ends in "Rahau" is the label read out. First, while it is
  // still spelled the way BaniDB spells it, and only right after a verse bar:
  // rahaau is also a word ("I remain"), five times in the Guru Granth Sahib,
  // and never after a bar, where every one of the 2,680 markers stands. The
  // bar is put back for the next rule to turn into a space.
  [/([|॥।]\s*)rahaau(?:\s+dhoojaa)?\b/gi, '$1'],
  [/\|+|॥|।/g, ' '], // verse bars, single ones too: Bhai Gurdas's lines end in |
  [/\d+/g, ''], // verse numbers
  [/\(n\)/gi, 'n'], // nasal marker: too(n) -> toon
  [/\(nn\)/gi, 'n'],
  // Subscript ha (ਨ੍ਹ): jin(h)aa -> jinha. Left alone, title case turned it
  // into "Jin(H)A", which the scanner's pointers showed.
  [/\(h\)/gi, 'h'],
  [/aa/gi, 'a'], // bairaagee -> bairagi
  [/oo/gi, 'u'], // too -> tu
  [/ee/gi, 'i'], // bairaagee -> bairagi
  [/dh\b/gi, 'd'], // word-final only: sabadh -> sabad, dhan stays
  [/\bth\b/gi, 't'], // standalone word only, not the th inside saath
  [/\s+/g, ' '],
];

export function prettyShabadName(transliteration: string): string {
  let out = transliteration;
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement);

  return (
    out
      .trim()
      // Title case, because that is how these are written everywhere they
      // appear. The rest of each word is lowercased, not left alone: BaniDB
      // capitalises mid-word to mark retroflex and aspirated letters, so
      // "kooR kapaT" arrived as "KuR KapaT" — meaningful in a transliteration
      // scheme, noise in a title. Matching on letter runs rather than splitting
      // on spaces also capitalises after a hyphen ("Ik-Oankar").
      //
      // ASCII letters, exactly names.py's rule. BaniDB's transliteration is
      // ASCII, and Python's standard regex has no \p{L}: a letter class the
      // two copies read differently is one line titled two ways. It did — a
      // quoted heading came out "'pavan" here and "'Pavan" there.
      .replace(/[A-Za-z][A-Za-z']*/g, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase())
  );
}

/**
 * The same line as a Gurmukhi title: BaniDB's `verse.unicode`, cleaned the way
 * `prettyShabadName` cleans its roman twin, so the two scripts carry the same
 * words and nothing else.
 *
 * Only what labels the line comes off — the verse bars, the verse numbers and
 * the rahao marker. The spelling is scripture and stays exactly as BaniDB has
 * it, which is why the marker must follow a bar, as in the roman rule:
 * ਰਹਾਉ is a word too, and taking it off "ਭਾਈ ਰੇ ਗੁਰਮਤਿ ਸਾਚਿ ਰਹਾਉ ॥" would cut
 * the line short. ਰਹਾੳ is how BaniDB spells one real marker (shabad 1416).
 * Bounded by bars, spaces or the end rather than `\b`, which in JavaScript
 * only knows ASCII word characters.
 */
const GURMUKHI_RULES: [RegExp, string][] = [
  [/([॥।|]\s*)ਰਹਾ[ਉੳ](?:\s+ਦੂਜਾ)?(?=[\s॥।|]|$)/gu, '$1'],
  [/[॥।|]/g, ' '],
  [/[੦-੯0-9]+/g, ''],
  [/\s+/g, ' '],
];

export function prettyGurmukhiName(unicode: string): string {
  let out = unicode;
  for (const [pattern, replacement] of GURMUKHI_RULES) out = out.replace(pattern, replacement);
  return out.trim();
}

/** A BaniDB line as far as naming goes — a search hit and a shabad verse both fit. */
export interface TitledLine {
  verse?: { unicode?: string };
  transliteration?: { english?: string };
}

/** The two titles of a rendition: `name` and `name_gurmukhi`. */
export interface RenditionTitles {
  name: string;
  gurmukhi: string | null;
}

/**
 * What a rendition anchored on this line is called, in both scripts.
 *
 * Every writer names a linked rendition through this or names.py's `titles`,
 * so the workbench, the scanner and fill_names.py cannot disagree about one
 * line. `Shabad 4064` stands in for a roman name BaniDB did not send, because
 * `name` may not be empty; a missing Gurmukhi is null instead, which leaves the
 * roman `name` as the rendition's only title.
 */
export function titlesFor(line: TitledLine, shabadId: number): RenditionTitles {
  return {
    name: prettyShabadName(line.transliteration?.english ?? '') || `Shabad ${shabadId}`,
    gurmukhi: prettyGurmukhiName(line.verse?.unicode ?? '') || null,
  };
}
