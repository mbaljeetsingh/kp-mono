/**
 * Session state, shared by all three apps.
 *
 * Supabase pushes auth changes rather than returning them, so this subscribes
 * once and mirrors into React state. `loading` is separate from a null session
 * on purpose: "not signed in" and "we do not know yet" render differently, and
 * conflating them flashes a sign-in panel at every signed-in listener on load.
 */
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { authTrouble, type KpClient } from './client';

export interface AuthState {
  session: Session | null;
  loading: boolean;
}

export function useAuth(client: KpClient): AuthState {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });
  const queryClient = useQueryClient();

  useEffect(() => {
    let live = true;

    void client.auth.getSession().then(({ data }) => {
      if (live) setState({ session: data.session, loading: false });
    });

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (live) setState({ session, loading: false });
    });

    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  /*
   * The cache has to follow the session, in two ways.
   *
   * A new token after auth trouble re-runs it. When a refresh fails for a
   * moment — the laptop just woke, the network or the auth server is not back —
   * supabase-js sends the publishable key in place of the user's token for at
   * least the minute it waits before retrying, and nothing says so: no auth
   * event fires and the app still shows the user signed in. What went out in
   * that window came back wrong: 401 for anything not granted to anon
   * (favorites, playlists, admin's `recordings`), or refused before it left
   * (admin, see ClientConfig.tokenless). No query is keyed on the token, so
   * without this the admin's tag page sat on its 401 until a reload, and a
   * listener's heart stayed filled for a favorite the server refused.
   *
   * Only after trouble, though (authTrouble, counted by the client's fetch).
   * Every hourly refresh replaces the token too, and re-running every query in
   * every tab for it bought nothing: auth-js keeps a still-valid token when a
   * refresh fails, so a routine rotation never follows an anonymous request.
   * Worse, with a device clock an hour fast every new token looks expired, so
   * each re-run refreshed again and the loop ran until the auth server's rate
   * limit signed the user out. Cancelled first, because invalidating joins a
   * first fetch already in flight rather than restarting it, and that answer
   * was sent without the token.
   *
   * A different user, or none, clears it. Signing out and back in — as someone
   * else, on the same tab — otherwise hands the next person the last one's
   * cached rows, drafts their access would hide included. Removed, not reset:
   * this effect runs before the components below it have moved their queries
   * to the new session's keys, so a reset — which refetches what is still
   * observed — re-ran the old user's queries signed out. The admin's
   * permissions came back all "no" from the publishable key, were cached under
   * that user for good (staleTime Infinity), and signing back in found every
   * control hidden until a reload. A removed query just builds afresh when a
   * component next asks for it.
   */
  const last = useRef<{ token: string; userId: string; trouble: number } | null>(null);
  useEffect(() => {
    const session = state.session;
    const prev = last.current;
    if (!session) {
      if (prev) {
        last.current = null;
        queryClient.removeQueries();
      }
      return;
    }
    if (prev?.token === session.access_token) return;
    const trouble = authTrouble(client);
    last.current = { token: session.access_token, userId: session.user.id, trouble };
    if (!prev) return;
    if (session.user.id !== prev.userId) {
      queryClient.removeQueries();
    } else if (trouble !== prev.trouble) {
      void queryClient.cancelQueries().then(() => queryClient.invalidateQueries());
    }
  }, [state.session, client, queryClient]);

  return state;
}

export function signInWithPassword(client: KpClient, email: string, password: string) {
  return client.auth.signInWithPassword({ email, password });
}

export function signOut(client: KpClient) {
  return client.auth.signOut();
}

/**
 * Create an account.
 *
 * Returns whether the account still needs an email confirmation. With
 * confirmations off (the local default) signup returns a session and the auth
 * listener signs them straight in; with them on, `session` is null, and saying
 * so is the difference between "check your email" and an app that looks broken.
 */
export async function signUp(
  client: KpClient,
  email: string,
  password: string
): Promise<{ error?: string; confirm?: boolean }> {
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) return { error: error.message };
  return { confirm: !data.session };
}

/**
 * Delete the signed-in user's account, then sign out locally.
 *
 * The stores require this of any app with sign-up (supabase migration
 * 20261006000000 says what goes and what stays). Signing out afterwards is
 * local-only: the server session died with the user, and a global sign-out
 * would ask the auth server to revoke a session it no longer has.
 */
export async function deleteOwnAccount(client: KpClient): Promise<{ error?: string }> {
  const { error } = await client.rpc('delete_own_account');
  if (error) return { error: error.message };
  await client.auth.signOut({ scope: 'local' });
  return {};
}
