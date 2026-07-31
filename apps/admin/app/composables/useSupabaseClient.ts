/**
 * Supabase client.
 *
 * Deliberately not `@nuxtjs/supabase`: that module's SSR cookie handling is
 * incompatible with the h3 v2 release Nuxt 4.5 ships (`event.req.headers.get
 * is not a function`), and the catalogue is public-read anyway — there is no
 * session to hydrate on the server.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function useSupabaseClient(): SupabaseClient {
  if (client) return client;
  const { supabaseUrl, supabaseKey } = useRuntimeConfig().public;
  client = createClient(supabaseUrl as string, supabaseKey as string, {
    // Anonymous reads on the server must not try to touch browser storage.
    auth: {
      persistSession: import.meta.client,
      autoRefreshToken: import.meta.client,
    },
  });
  return client;
}
