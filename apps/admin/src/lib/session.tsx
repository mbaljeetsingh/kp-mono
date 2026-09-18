/**
 * Who is signed in, and what they may do — asked once.
 *
 * Every route here needs both, and each was calling `useAuth(supabase)` for
 * itself: six `getSession()` round trips and six `onAuthStateChange`
 * subscriptions on a page that has one session, each transitioning through its
 * own `loading` so a route could render "not signed in" while the shell
 * already knew otherwise.
 *
 * Permissions ride along because they are the same question one layer down,
 * and because `usePermissions` needs to be told whether there is a session at
 * all — a fact only this provider should have to establish. The query itself
 * is already cached under one key, so this is about where the answer comes
 * from, not how often it is fetched.
 */
import { useAuth, usePermissions, type PermissionMap } from '@kp/api';
import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { supabase } from '~/lib/supabase';

interface SessionValue {
  session: Session | null;
  userId: string | null;
  /**
   * "We do not know yet" is not "signed out". Conflating them flashes the
   * sign-in form at every contributor on every load.
   */
  loading: boolean;
  can: PermissionMap;
  /** A control must not flash before we know whether it is allowed. */
  permissionsLoading: boolean;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth(supabase);
  const { can, loading: permissionsLoading } = usePermissions(supabase, Boolean(session));

  const value = useMemo(
    () => ({
      session,
      userId: session?.user.id ?? null,
      loading,
      can,
      permissionsLoading,
    }),
    [session, loading, can, permissionsLoading]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
