/**
 * Session, favorites and the sign-in sheet, in one context.
 *
 * Mirrors the web app's, for the same reasons: none of it changes at 10Hz —
 * that is the player's problem — and the sign-in prompt has to be openable from
 * anywhere, because a row that mounts its own sheet is one sheet per visible
 * shabad.
 */
import { useAuth, useFavorites, type Favorites } from '@kp/api';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '~/lib/supabase';

interface SessionValue {
  session: Session | null;
  userId: string | null;
  loading: boolean;
  favorites: Favorites;
  promptOpen: boolean;
  prompt: () => void;
  closePrompt: () => void;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth(supabase);
  const userId = session?.user.id ?? null;
  const favorites = useFavorites(supabase, userId);
  const [promptOpen, setPromptOpen] = useState(false);

  const prompt = useCallback(() => setPromptOpen(true), []);
  const closePrompt = useCallback(() => setPromptOpen(false), []);

  const value = useMemo(
    () => ({ session, userId, loading, favorites, promptOpen, prompt, closePrompt }),
    [session, userId, loading, favorites, promptOpen, prompt, closePrompt]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
