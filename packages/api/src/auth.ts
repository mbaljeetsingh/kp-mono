/**
 * Session state, shared by both React apps.
 *
 * Supabase pushes auth changes rather than returning them, so this subscribes
 * once and mirrors into React state. `loading` is separate from a null session
 * on purpose: "not signed in" and "we do not know yet" render differently, and
 * conflating them flashes a sign-in panel at every signed-in listener on load.
 */
import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import type { KpClient } from './client';

export interface AuthState {
  session: Session | null;
  loading: boolean;
}

export function useAuth(client: KpClient): AuthState {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });

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

  return state;
}

export function signInWithPassword(client: KpClient, email: string, password: string) {
  return client.auth.signInWithPassword({ email, password });
}

export function signOut(client: KpClient) {
  return client.auth.signOut();
}
