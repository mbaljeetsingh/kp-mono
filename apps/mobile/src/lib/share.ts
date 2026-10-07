/**
 * Handing a rendition's link on: the system share sheet, which on a phone is
 * WhatsApp in one tap — how these links travel.
 *
 * The link is the web's `/r/<id>?t=` (@kp/core's `shareUrl`), so it opens in
 * any browser, and the app handles it when installed (src/app/r/[id].tsx).
 */
import { shareUrl, type Playable } from '@kp/core';
import { Platform, Share } from 'react-native';

export const SITE_ORIGIN = 'https://kirtanplayer.beejaysoft.com';

export async function shareRendition(item: Playable, position: number, title: string) {
  const url = shareUrl(item, position, SITE_ORIGIN);
  // The title as the sharer sees it: someone reading ਪੰਜਾਬੀ shares the
  // Gurmukhi, and the person they send it to most likely reads it too.
  const text = item.subtitle ? `${title} · ${item.subtitle}` : title;
  try {
    // iOS takes the link separately and shows it as a card — put it in the
    // message as well and it is shared twice. Android has only `message`.
    await Share.share(
      Platform.OS === 'ios' ? { message: text, url } : { message: `${text}\n${url}`, title }
    );
  } catch {
    // Closing the sheet is an answer, not a failure.
  }
}
