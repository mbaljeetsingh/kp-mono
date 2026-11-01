/**
 * The Search term, and whether the Gurmukhi keys are up.
 *
 * Held outside the screen because the keys are not drawn in it. Like the phone's
 * keyboard they cover the tab bar, which only something outside the tab screens
 * can do ((tabs)/_layout.tsx).
 */
import { create } from 'zustand';

interface SearchKeysState {
  term: string;
  /** Whether the listener wants them up: tapping the field, or putting them down. */
  keysOpen: boolean;
  /** Whether they can show at all: Search in front, online, in Punjabi. */
  keysAvailable: boolean;
  setTerm: (term: string) => void;
  setKeysOpen: (open: boolean) => void;
  setKeysAvailable: (available: boolean) => void;
}

export const useSearchKeys = create<SearchKeysState>((set) => ({
  term: '',
  keysOpen: true,
  keysAvailable: false,
  setTerm: (term) => set({ term }),
  setKeysOpen: (keysOpen) => set({ keysOpen }),
  setKeysAvailable: (keysAvailable) => set({ keysAvailable }),
}));
