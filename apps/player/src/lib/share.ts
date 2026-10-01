/**
 * Links to one rendition, and handing them on.
 *
 * `/r/<id>?t=<seconds>` — a path of its own rather than a query on Home, so a
 * later edge function can give each shabad its own preview card by matching
 * `/r/*` alone, without looking inside every request for `/`. `t` is seconds
 * into the shabad, the clock the seek bar shows; `/r/$id` in the router turns
 * it back into a position.
 */
import { elapsedIn, type Playable } from '@kp/core';
import { toast } from 'sonner';

/**
 * Below this the link starts from the top. Someone a few seconds in is sharing
 * the shabad, not a moment in it, and a link that opens on 0:04 reads as a
 * mistake.
 */
const FROM_HERE_SEC = 10;

export function shareUrl(item: Playable, position: number, origin = window.location.origin) {
  const url = `${origin}/r/${encodeURIComponent(item.id)}`;
  // Rounded, not floored: a link cued at 1:30 reports 89.999… back from the
  // audio element, and flooring that would make every re-share a second early.
  const into = Math.round(elapsedIn(item, position));
  return into >= FROM_HERE_SEC ? `${url}?t=${into}` : url;
}

/**
 * The system share sheet where there is one — on a phone that is WhatsApp in
 * one tap, which is how these links travel — and the clipboard where there is
 * not, which is most desktops.
 */
export async function shareRendition(item: Playable, position: number) {
  const url = shareUrl(item, position);
  const title = item.title;
  const text = item.subtitle ? `${item.title} · ${item.subtitle}` : item.title;

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
