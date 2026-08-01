/**
 * Account state — optional, and deliberately thin.
 *
 * Module-level refs rather than a store, for the same reason `usePlayer` uses
 * them: there is one session per browser, so every page shares this instance
 * and nothing needs installing.
 *
 * There is no profile, role or permission fetch here. The player reads its own
 * favorites and playlists, both of which RLS scopes to `auth.uid()` — the app
 * never needs to know *what* the account may do, only whether there is one.
 *
 * Signing in never gates listening. The whole catalogue stays readable to
 * `anon`, so the only thing an account changes is where saved things live.
 */
import { ref } from 'vue';
import type { User } from '@supabase/supabase-js';

const user = ref<User | null>(null);

/**
 * False until the client has looked for a stored session.
 *
 * Load-bearing for SSR: `useSupabaseClient` only persists a session on the
 * client, so the server renders every page signed-out. Auth-dependent chrome
 * must stay in its guest state until this flips, or the client renders authed
 * against guest HTML and hydration mismatches the shell.
 */
const ready = ref(false);

/** Sign-in dialog visibility. Lives here so any component — a row menu, an
 *  empty state — can ask for a sign-in without owning a dialog of its own. */
const promptOpen = ref(false);

let initialized = false;

export function useAuth() {
  const supabase = useSupabaseClient();

  /**
   * Load the stored session and start listening for changes. Call once, from
   * `onMounted` in app.vue — never from setup, which also runs on the server.
   */
  async function init() {
    if (initialized || import.meta.server) return;
    initialized = true;

    // Fires INITIAL_SESSION immediately, then on every sign-in, sign-out and
    // token refresh — including ones from another tab, which is the only way
    // this app learns its session was revoked. Nothing async happens inside:
    // awaiting a Supabase call in this callback deadlocks the client.
    supabase.auth.onAuthStateChange((_event, session) => {
      user.value = session?.user ?? null;
      ready.value = true;
    });

    try {
      const { data } = await supabase.auth.getSession();
      user.value = data.session?.user ?? null;
    } finally {
      // Always flip, even if reading the stored session threw (a storage
      // adapter that denies access, a gateway error mid-refresh). Every
      // auth-dependent surface is gated on `ready`, so leaving it false hides
      // the account button *and* renders the playlists page as a blank panel,
      // with no retry and nothing on screen to explain it.
      ready.value = true;
    }
  }

  /** Resolves to an error message, or null on success. */
  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return error.message;
    promptOpen.value = false;
    return null;
  }

  /**
   * Resolves to `{ error }` on failure, or `{ confirm }` telling the caller
   * whether the account still needs an email confirmation. With confirmations
   * off (the local default) signup returns a session and the listener above
   * signs them straight in; with them on, `session` is null and saying so is
   * the difference between "check your email" and an app that looks broken.
   */
  async function signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (data.session) promptOpen.value = false;
    return { confirm: !data.session };
  }

  async function signOut() {
    await supabase.auth.signOut();
    // The listener clears `user`, but do it here too: a failed sign-out still
    // drops the local session, and leaving the account chrome up would suggest
    // saves are still going somewhere.
    user.value = null;
  }

  /** Open the sign-in dialog. */
  function prompt() {
    promptOpen.value = true;
  }

  return { user, ready, promptOpen, init, signIn, signUp, signOut, prompt };
}
