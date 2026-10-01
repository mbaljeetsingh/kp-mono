/**
 * Arriving from a shared link: `/r/<rendition id>?t=<seconds>`.
 *
 * Not a page. It loads the shabad into the player — parked at `t`, paused —
 * and hands over to Home. Paused because browsers refuse sound nobody asked
 * for; the listener presses the same Play they would anywhere else, and it
 * starts where the link said.
 *
 * A loader rather than an effect in a component: it runs once per arrival,
 * where an effect would run twice under StrictMode and re-run on remounts.
 * The redirect replaces the history entry, so Back leaves the site rather than
 * landing on the link and loading it again.
 */
import { shabadById } from '@kp/api';
import { linkStartPosition } from '@kp/core';
import { redirect } from '@tanstack/react-router';
import { toast } from 'sonner';

import { playerActions } from '~/lib/player';
import { supabase } from '~/lib/supabase';

/**
 * Deferred a tick: on a cold load this runs before the shell — and its
 * `<Toaster />` — has mounted, and a toast raised before that is never shown.
 */
function sayLater(message: string) {
  setTimeout(() => toast.error(message), 0);
}

export async function openSharedLink(id: string, t: unknown): Promise<never> {
  try {
    const item = await shabadById(supabase, id);
    if (item) playerActions.cue(item, linkStartPosition(item, t));
    else sayLater('That shabad isn’t available any more.');
  } catch {
    sayLater('Could not open that shabad. Check your connection and try the link again.');
  }
  throw redirect({ to: '/', replace: true });
}
