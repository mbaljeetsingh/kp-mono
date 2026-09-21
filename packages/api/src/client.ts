/**
 * One Supabase client, created by whoever knows the environment.
 *
 * The apps differ in how they read config — Vite exposes `import.meta.env`,
 * Expo exposes `process.env.EXPO_PUBLIC_*` — so this package takes the values
 * rather than reaching for them. It also means a test can hand over a stub.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type KpClient = SupabaseClient;

export interface ClientConfig {
  url: string;
  /** The publishable (anon) key. Never a service key — this runs in a browser. */
  key: string;
  /**
   * Where the session is kept. Web uses localStorage by default; React Native
   * has none, so Expo passes AsyncStorage or the session dies with the process.
   */
  storage?: {
    getItem(key: string): Promise<string | null> | string | null;
    setItem(key: string, value: string): Promise<void> | void;
    removeItem(key: string): Promise<void> | void;
  };
  /**
   * False on native. Supabase's implicit flow reads the session out of the URL
   * hash on load, which has no meaning in an app and makes it hang waiting for
   * a `window` that is not there.
   */
  detectSessionInUrl?: boolean;
}

export function createKpClient({
  url,
  key,
  storage,
  detectSessionInUrl = true,
}: ClientConfig): KpClient {
  return createClient(url, key, {
    auth: {
      storage: storage as never,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl,
    },
  });
}
