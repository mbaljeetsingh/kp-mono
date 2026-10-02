/**
 * Which script a listener reads titles in.
 *
 * A rendition is titled from one line in two scripts (#77): `title`, roman,
 * which every rendition has, and `titleGurmukhi`, which a linked one has.
 * The choice is the listener's, remembered per device; the rules for turning
 * it into what a row, a tile or the lock screen shows live here, so the web
 * player and the phone cannot show one rendition two ways.
 *
 * Hindi comes later, converted on the device from the Gurmukhi (anvaad), not
 * stored — which is why this is a script and not a column name.
 */
import { artworkFor } from './artwork';
import type { Playable } from './types';

export type TitleScript = 'en' | 'pa';

export interface TitleScriptOption {
  value: TitleScript;
  /** The language in its own script, so a listener finds theirs without reading the rest. */
  label: string;
  /** What a selector's button shows where there is no room for the label. */
  short: string;
  /** BCP 47 tag for text in this script, when it is not the page's own. */
  lang?: string;
}

/**
 * Every script on offer, in np-mono's order — one list for the web's selector
 * and the phone's, so हिन्दी is one more entry here, not a change in each app.
 */
export const TITLE_SCRIPTS: readonly TitleScriptOption[] = [
  { value: 'pa', label: 'ਪੰਜਾਬੀ', short: 'ਪੰ', lang: 'pa' },
  { value: 'en', label: 'English', short: 'En' },
];

/** Anything else — a stale or hand-edited stored value — reads as roman. */
export function parseTitleScript(value: unknown): TitleScript {
  return TITLE_SCRIPTS.find((option) => option.value === value)?.value ?? 'en';
}

/** The option a selector names as current. */
export function titleScriptOption(script: TitleScript): TitleScriptOption {
  return TITLE_SCRIPTS.find((option) => option.value === script) ?? TITLE_SCRIPTS[1]!;
}

type Titled = Pick<Playable, 'title' | 'titleGurmukhi'>;

/**
 * Whether this item's title shows in Gurmukhi: the listener chose ਪੰਜਾਬੀ and
 * it has one. Read for the font and `lang` as well as the text, so a roman
 * fallback is never drawn in a Gurmukhi face or announced as Punjabi.
 */
export function showsGurmukhi(item: Titled, script: TitleScript): boolean {
  return script === 'pa' && Boolean(item.titleGurmukhi);
}

/** The title as this listener sees it: Gurmukhi when chosen and there, roman otherwise. */
export function titleIn(item: Titled, script: TitleScript): string {
  return showsGurmukhi(item, script) ? item.titleGurmukhi! : item.title;
}

/**
 * Two letters for a tile, taken from the title as shown — ਜਜ for ਜਗਿ ਜੀਵਨੁ.
 *
 * The first code point of each word, which in Gurmukhi is the letter (a vowel
 * sign follows the consonant it belongs to). A roman title keeps the initials
 * the tile always had.
 */
export function titleInitials(item: Titled, script: TitleScript): string {
  if (!showsGurmukhi(item, script)) return artworkFor(item.title).initials;
  return item
    .titleGurmukhi!.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0] ?? '')
    .join('');
}

/** What a shabad's tile draws, before either app paints it. */
export interface PlayableTile {
  /** Picks the gradient: the shabad, so one shabad has one colour whoever sings it. */
  seed: string;
  initials: string;
  /** The initials are Gurmukhi, for the Gurbani face. */
  gurmukhi: boolean;
}

/**
 * A rendition's tile — coloured by the shabad rather than the ragi, lettered
 * from the title as shown. A ragi's tile on every row made one ragi's list a
 * column of identical squares, while the same shabad sung by two ragis looked
 * unrelated; keyed on the BaniDB id it is the other way round. The colour
 * stays the shabad's whichever script is chosen.
 */
export function playableTile(
  item: Titled & Pick<Playable, 'shabadId'>,
  script: TitleScript
): PlayableTile {
  return {
    seed: String(item.shabadId ?? item.title),
    initials: titleInitials(item, script),
    gurmukhi: showsGurmukhi(item, script),
  };
}
