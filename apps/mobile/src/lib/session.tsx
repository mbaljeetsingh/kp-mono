/**
 * Session, favorites and the sign-in sheet, in one context.
 *
 * Mirrors the web app's, for the same reasons: none of it changes at 10Hz —
 * that is the player's problem — and the sign-in prompt has to be openable from
 * anywhere, because a row that mounts its own sheet is one sheet per visible
 * shabad.
 */
import { useAuth, useFavorites, type Favorites, type FavoritesStorage } from '@kp/api';
import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { storage } from '~/lib/storage';
import { supabase } from '~/lib/supabase';

interface SessionValue {
  session: Session | null;
  userId: string | null;
  loading: boolean;
  favorites: Favorites;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth(supabase);
  const userId = session?.user.id ?? null;
  const favorites = useFavorites(supabase, userId, storage);

  /*
   * No sign-in prompt flag here, unlike the web's provider. Sign-in on a phone
   * is a route — `/sign-in`, presented as a modal — so a screen that needs an
   * account pushes it. The flag this used to carry opened the web app's
   * AuthDialog; nothing on this side renders one, so it was state that could
   * only ever be set.
   */
  const value = useMemo(
    () => ({ session, userId, loading, favorites }),
    [session, userId, loading, favorites]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
