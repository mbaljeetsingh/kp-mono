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
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';

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
  const { can, loading: permissionsLoading } = usePermissions(supabase, session?.user.id);

  /*
   * A replaced token means everything cached may have been fetched without
   * one. When a refresh fails for a moment — the laptop just woke, the network
   * or Docker is not back yet — supabase-js hands every request the anon key
   * instead, and nothing says so: `recordings` answers 401 (the view is not
   * granted to anon), `renditions` answers 200 with published rows only, and
   * the shell still shows the user signed in, because a retryable failure is
   * not a sign-out. The next refresh succeeds, but no query is keyed on the
   * token, so the tag page sat blank on its 401 until a reload. Re-running
   * everything when a token REPLACES another one covers the errors and the
   * silently wrong successes alike.
   *
   * "Replaces" is against the last token this page had, across any signed-out
   * gap: a failure that ends in SIGNED_OUT and a fresh sign-in leaves the same
   * anon-fetched rows in the cache as one that recovers. The very first token
   * replaces nothing — the shell renders no route before it, so nothing ran.
   */
  const queryClient = useQueryClient();
  const token = session?.access_token ?? null;
  const lastToken = useRef<string | null>(null);
  useEffect(() => {
    if (!token) return;
    const replaced = lastToken.current;
    lastToken.current = token;
    if (replaced && replaced !== token) void queryClient.invalidateQueries();
  }, [token, queryClient]);

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
