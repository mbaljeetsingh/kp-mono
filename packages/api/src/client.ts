/**
 * One Supabase client, created by whoever knows the environment.
 *
 * The apps differ in how they read config — Vite exposes `import.meta.env`,
 * Expo exposes `process.env.EXPO_PUBLIC_*` — so this package takes the values
 * rather than reaching for them. It also means a test can hand over a stub.
 */
import { createClient, PostgrestError, type SupabaseClient } from '@supabase/supabase-js';

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
  /**
   * What happens to a request about to leave without the signed-in user's
   * token. When a refresh fails for a moment — the laptop just woke, the
   * network or the auth server is not back — supabase-js sends the publishable
   * key instead, for at least the minute it waits before trying again, and
   * says nothing: no auth event fires, so the app still shows the user signed
   * in.
   *
   * `'send'` (the default) lets it go. The listener apps' public reads answer
   * the same either way, and their own rows (favorites, playlists) are not
   * granted to anon, so those fail loudly instead.
   *
   * `'refuse'` answers it here with a 401. For admin, where every read is the
   * user's, an anonymous answer is wrong in a way nothing can see:
   * `renditions` returns 200 with published rows only, so Review says
   * "Nothing waiting" and a tag page offers whole-file publish over a draft it
   * no longer shows. A failure is at least visible, and retried.
   */
  tokenless?: 'send' | 'refuse';
}

/** What the guard knows about the session, and what it has seen go wrong. */
export interface AuthWatch {
  signedIn: boolean;
  /**
   * Requests that left, or would have, without the signed-in user's token,
   * plus data requests answered 401 while signed in (a token the server
   * already considers expired — a client clock running behind).
   */
  trouble: number;
}

const watches = new WeakMap<KpClient, AuthWatch>();

/**
 * How much auth trouble this client has seen since load (see AuthWatch).
 * useAuth compares it across token changes: a new token after trouble means
 * the cache may hold answers fetched without one; a new token without any
 * is a routine refresh, and re-fetching then would buy nothing.
 */
export function authTrouble(client: KpClient): number {
  return watches.get(client)?.trouble ?? 0;
}

const RENEWING = 'Your sign-in is being renewed. Try again in a moment.';

const REFUSED = JSON.stringify({
  code: 'PGRST301',
  message: RENEWING,
  details: null,
  hint: null,
});

/**
 * The fetch every request of a client goes through — the auth client's own
 * included, which is why /auth/v1/ passes untouched: sign-in and the refresh
 * itself are meant to go out on the publishable key.
 */
export function guardFetch(
  watch: AuthWatch,
  { url, key, tokenless = 'send' }: Pick<ClientConfig, 'url' | 'key' | 'tokenless'>,
  base: typeof fetch = (input, init) => fetch(input, init)
): typeof fetch {
  const authPath = `${url.replace(/\/+$/, '')}/auth/v1/`;
  return async (input, init) => {
    const target = typeof input === 'string' ? input : 'href' in input ? input.href : input.url;
    if (!watch.signedIn || target.startsWith(authPath)) return base(input, init);

    const bearer = new Headers(init?.headers).get('Authorization');
    if (!bearer || bearer === `Bearer ${key}`) {
      watch.trouble += 1;
      if (tokenless === 'refuse') {
        return new Response(REFUSED, {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    const response = await base(input, init);
    if (response.status === 401) watch.trouble += 1;
    return response;
  };
}

export function createKpClient({
  url,
  key,
  storage,
  detectSessionInUrl = true,
  tokenless = 'send',
}: ClientConfig): KpClient {
  const watch: AuthWatch = { signedIn: false, trouble: 0 };
  const client = createClient(url, key, {
    auth: {
      storage: storage as never,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl,
    },
    global: { fetch: guardFetch(watch, { url, key, tokenless }) },
  });
  // "Signed in" means what the auth events say, the same events useAuth
  // mirrors into React. A refresh that fails retryably emits none, so the
  // watch stays signed in through exactly the window it exists to catch.
  client.auth.onAuthStateChange((_event, session) => {
    watch.signedIn = session !== null;
  });
  watches.set(client, watch);
  return client;
}

/**
 * What a failed query throws.
 *
 * postgrest-js hands a query's error back as a plain object (its types say
 * otherwise), and the apps read anything that is not an Error as "Failed": the
 * sign-in-renewed message guardFetch writes never reached the screen, and nor
 * did any refusal Postgres explained. This is the PostgrestError throwOnError
 * would have thrown — an Error, with its code, details and hint still on it.
 *
 * Its message only when PostgREST wrote it, which its code says. Without one
 * the "message" is whatever else happened: a network failure ("TypeError:
 * Failed to fetch"), or the raw body of a response PostgREST never wrote —
 * empty from a gateway's 502, which left every alert blank, or an HTML page.
 * An expired token (PGRST303, a clock running behind) reads as what it is
 * for the user: the same renewal guardFetch answers for.
 */
export function toError(error: PostgrestError): PostgrestError {
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = typeof error?.message === 'string' ? error.message.trim() : '';
  const readable = code !== '' && message !== '';
  return new PostgrestError({
    message:
      code === 'PGRST303'
        ? RENEWING
        : readable
          ? message
          : "Couldn't reach the server, or it didn't answer properly. Try again in a moment.",
    details: readable ? error.details : (JSON.stringify(error) ?? '').slice(0, 500),
    hint: error?.hint ?? '',
    code,
  });
}
