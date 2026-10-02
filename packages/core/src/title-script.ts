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

/** Anything else — a stale or hand-edited stored value — reads as roman. */
export function parseTitleScript(value: unknown): TitleScript {
  return value === 'pa' ? 'pa' : 'en';
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
