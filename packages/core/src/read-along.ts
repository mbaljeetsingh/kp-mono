/**
 * How a listener likes the read-along set, remembered per device.
 *
 * The rules live here so the web player and the phone cannot disagree on what
 * a choice means or which words a line shows; each app only decides how a size
 * is drawn and where the choice is kept.
 */

export type ReadAlongTextSize = 'small' | 'medium' | 'large';

export interface ReadAlongOptions {
  /** Roman spelling under the Gurmukhi, for a listener still learning the script. */
  transliteration: boolean;
  /** The line as it stands in the Guru Granth Sahib, with no breaks between words. */
  larivaar: boolean;
  textSize: ReadAlongTextSize;
}

/** Off and medium: what the read-along showed before there was a choice. */
export const DEFAULT_READ_ALONG_OPTIONS: ReadAlongOptions = {
  transliteration: false,
  larivaar: false,
  textSize: 'medium',
};

export const READ_ALONG_TEXT_SIZES: readonly { value: ReadAlongTextSize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

/**
 * A stored value, taken field by field: a stale or hand-edited one loses only
 * the part that no longer reads, and a choice added later starts at its default.
 */
export function parseReadAlongOptions(value: unknown): ReadAlongOptions {
  if (typeof value !== 'object' || value === null) return DEFAULT_READ_ALONG_OPTIONS;
  const stored = value as Partial<Record<keyof ReadAlongOptions, unknown>>;
  return {
    transliteration: stored.transliteration === true,
    larivaar: stored.larivaar === true,
    textSize:
      READ_ALONG_TEXT_SIZES.find((size) => size.value === stored.textSize)?.value ??
      DEFAULT_READ_ALONG_OPTIONS.textSize,
  };
}

/** The same, from the JSON a device stored. Private mode and bad JSON read as the defaults. */
export function readAlongOptionsFromJson(raw: string | null | undefined): ReadAlongOptions {
  if (!raw) return DEFAULT_READ_ALONG_OPTIONS;
  try {
    return parseReadAlongOptions(JSON.parse(raw));
  } catch {
    return DEFAULT_READ_ALONG_OPTIONS;
  }
}

interface VerseText {
  unicode?: string;
  gurmukhi?: string;
}

/**
 * The Gurmukhi a line shows. A verse without larivaar text falls back to the
 * pad-chhed: a line with spaces is better than an empty one.
 */
export function verseGurmukhi(
  line: { verse?: VerseText; larivaar?: VerseText },
  options: Pick<ReadAlongOptions, 'larivaar'>
): string {
  const larivaar = options.larivaar
    ? (line.larivaar?.unicode ?? line.larivaar?.gurmukhi)
    : undefined;
  return larivaar || line.verse?.unicode || line.verse?.gurmukhi || '';
}
