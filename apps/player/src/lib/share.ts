/**
 * Handing a rendition's link on. The link itself is @kp/core's `shareUrl`,
 * shared with the mobile app.
 */
import { shareUrl as coreShareUrl, type Playable } from '@kp/core';
import { toast } from 'sonner';

export function shareUrl(item: Playable, position: number, origin = window.location.origin) {
  return coreShareUrl(item, position, origin);
}

/**
 * The system share sheet where there is one — on a phone that is WhatsApp in
 * one tap, which is how these links travel — and the clipboard where there is
 * not, which is most desktops.
 */
export async function shareRendition(item: Playable, position: number, title = item.title) {
  const url = shareUrl(item, position);
  // The title as the sharer sees it: someone reading ਪੰਜਾਬੀ shares the
  // Gurmukhi, and the person they send it to most likely reads it too.
  const text = item.subtitle ? `${title} · ${item.subtitle}` : title;

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch (err) {
      // Closing the sheet is an answer, not a failure: no toast, and no
      // copying behind the listener's back.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Anything else (no user gesture, a blocked share target) falls through.
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    toast.success('Link copied');
  } catch {
    toast.error('Could not copy the link');
  }
}
