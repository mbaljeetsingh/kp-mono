/**
 * Session, favorites and the sign-in prompt, in one context.
 *
 * A context rather than a store because none of it changes at 10Hz — that is
 * the player's problem, not this one — and because the sign-in prompt needs to
 * be openable from anywhere: a row menu that mounts its own dialog is one
 * mounted dialog per visible shabad.
 */
import { useAuth, useFavorites, type Favorites } from '@kp/api';
import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from '~/lib/supabase';

interface SessionValue {
  session: Session | null;
  userId: string | null;
  loading: boolean;
  favorites: Favorites;
  /** Sign-in dialog. `prompt()` opens it; anything gated calls that instead of failing. */
  promptOpen: boolean;
  prompt: () => void;
  closePrompt: () => void;
  /**
   * A shabad the listener tried to file before they had an account, held
   * across the sign-in detour. Dropping it meant coming back from signing in to
   * nothing, having to find the row and repeat the whole gesture.
   */
  pendingPick: { id: string; name: string } | null;
  setPendingPick: (pick: { id: string; name: string } | null) => void;
  /**
   * The create-playlist dialog, held here rather than in the row menu: one
   * mounted dialog per visible shabad is what per-row ownership costs.
   */
  newPlaylistOpen: boolean;
  setNewPlaylistOpen: (open: boolean) => void;
  /**
   * Ask for a new playlist, optionally holding a shabad to drop into it.
   * Signed-out callers get the sign-in dialog first — the create form would
   * only fail at the insert — but the pick is kept and reopened once the
   * session lands. Dropping it meant coming back from signing in to nothing.
   */
  openNewPlaylist: (pick?: { id: string; name: string }) => void;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth(supabase);
  const userId = session?.user.id ?? null;
  const favorites = useFavorites(supabase, userId);

  const [promptOpen, setPromptOpen] = useState(false);
  const [pendingPick, setPendingPick] = useState<{ id: string; name: string } | null>(null);
  const [newPlaylistOpen, setNewPlaylistOpen] = useState(false);

  const prompt = useCallback(() => setPromptOpen(true), []);
  const closePrompt = useCallback(() => setPromptOpen(false), []);

  const openNewPlaylist = useCallback(
    (pick?: { id: string; name: string }) => {
      setPendingPick(pick ?? null);
      if (!userId) {
        setPromptOpen(true);
        return;
      }
      setNewPlaylistOpen(true);
    },
    [userId]
  );

  // Pick up an interrupted "add to playlist" once there is a session. Gated on
  // the sign-in dialog being shut: opening this one while that is still up puts
  // two focus traps on screen, and which settles first depends on whether the
  // auth listener fires before or after the dialog closes.
  useEffect(() => {
    if (userId && pendingPick && !promptOpen) setNewPlaylistOpen(true);
  }, [userId, pendingPick, promptOpen]);

  const value = useMemo(
    () => ({
      session,
      userId,
      loading,
      favorites,
      promptOpen,
      prompt,
      closePrompt,
      pendingPick,
      setPendingPick,
      newPlaylistOpen,
      setNewPlaylistOpen,
      openNewPlaylist,
    }),
    [
      session,
      userId,
      loading,
      favorites,
      promptOpen,
      prompt,
      closePrompt,
      pendingPick,
      newPlaylistOpen,
      openNewPlaylist,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
