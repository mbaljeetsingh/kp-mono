/**
 * Playlists — account-only.
 *
 * Favorites work without an account because losing one browser's list costs a
 * few taps to rebuild. A named collection someone spent an hour assembling is
 * not something to keep in localStorage and hope, so playlists exist only for
 * signed-in listeners; the UI asks for a sign-in instead of degrading.
 *
 * Module-level state, like `usePlayer` and `useAuth`: the row menus need the
 * playlist names to render their submenu, and re-fetching that list per row
 * would be one request per visible shabad.
 */
import { effectScope, ref, watch } from 'vue';

export interface Playlist {
  id: string;
  name: string;
  created_at: string;
  /** Rows in the playlist. Read from an embedded count, so the list page needs
   *  one request rather than one per playlist. */
  count: number;
}

const playlists = ref<Playlist[]>([]);
const loading = ref(false);

/** The "new playlist" dialog, and the shabad (if any) waiting to go into it.
 *  App-level rather than per-row: a dialog inside `ShabadMenu` would be one
 *  mounted dialog per visible row.
 *
 *  The pick carries its name as well as its id so the dialog can say which
 *  shabad it is holding — which matters most when the pick survives a sign-in
 *  detour and the listener is several steps away from the row they tapped. */
const newOpen = ref(false);
const pendingPick = ref<{ id: string; name: string } | null>(null);

let scope: ReturnType<typeof effectScope> | null = null;

export function usePlaylists() {
  const supabase = useSupabaseClient();
  const { user, prompt, promptOpen } = useAuth();

  async function load() {
    if (!user.value) return;
    loading.value = true;
    // `playlist_items(count)` is a PostgREST aggregate embed over the foreign
    // key — the count comes back with the parent row.
    const { data, error } = await supabase
      .from('playlists')
      .select('id, name, created_at, playlist_items(count)')
      .order('created_at', { ascending: false });
    // Hold the current list if the read failed. Writing `[]` would show
    // "No playlists yet" to someone who has ten, which reads as data loss.
    if (!error) {
      playlists.value = (data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        created_at: p.created_at,
        count: p.playlist_items?.[0]?.count ?? 0,
      }));
    }
    loading.value = false;
  }

  /** Resolves to the new playlist, or null if the write failed. */
  async function create(name: string) {
    const u = user.value;
    if (!u) return null;
    const { data, error } = await supabase
      .from('playlists')
      .insert({ user_id: u.id, name: name.trim() })
      .select('id, name, created_at')
      .single();
    if (error || !data) return null;
    const playlist: Playlist = { ...(data as any), count: 0 };
    playlists.value = [playlist, ...playlists.value];
    return playlist;
  }

  async function rename(id: string, name: string) {
    const { error } = await supabase
      .from('playlists')
      .update({ name: name.trim() })
      .eq('id', id);
    if (error) return error.message;
    playlists.value = playlists.value.map((p) =>
      p.id === id ? { ...p, name: name.trim() } : p
    );
    return null;
  }

  async function remove(id: string) {
    const { error } = await supabase.from('playlists').delete().eq('id', id);
    if (error) return error.message;
    playlists.value = playlists.value.filter((p) => p.id !== id);
    return null;
  }

  /**
   * Add a shabad, ignoring a repeat add rather than erroring on the primary
   * key. Resolves to true when the row is in the playlist either way, so the
   * caller can confirm without having to distinguish "added" from "was already
   * there" — a distinction the listener does not care about.
   */
  async function addItem(playlistId: string, renditionId: string) {
    const { data, error } = await supabase
      .from('playlist_items')
      .upsert(
        { playlist_id: playlistId, rendition_id: renditionId },
        { onConflict: 'playlist_id,rendition_id', ignoreDuplicates: true }
      )
      .select('rendition_id');
    if (error) return false;
    // An ignored duplicate comes back as an empty array, and that is the only
    // signal that nothing was inserted — the request still succeeds. Bumping
    // unconditionally left the list page claiming "2 shabads" over a
    // one-row playlist until the next reload.
    //
    // Only the count needs patching: `position` is assigned by the trigger, and
    // the items themselves are read per playlist page.
    if (data?.length) {
      playlists.value = playlists.value.map((p) =>
        p.id === playlistId ? { ...p, count: p.count + 1 } : p
      );
    }
    return true;
  }

  async function removeItem(playlistId: string, renditionId: string) {
    const { error } = await supabase
      .from('playlist_items')
      .delete()
      .eq('playlist_id', playlistId)
      .eq('rendition_id', renditionId);
    if (error) return error.message;
    playlists.value = playlists.value.map((p) =>
      p.id === playlistId ? { ...p, count: Math.max(p.count - 1, 0) } : p
    );
    return null;
  }

  /** One playlist's shabads, in playlist order, with everything a row needs to
   *  render and play. */
  async function items(playlistId: string) {
    const { data } = await supabase
      .from('playlist_shabads')
      .select('*')
      .eq('playlist_id', playlistId)
      .order('position');
    return (data ?? []) as any[];
  }

  async function get(playlistId: string) {
    const { data } = await supabase
      .from('playlists')
      .select('id, name, created_at')
      .eq('id', playlistId)
      .maybeSingle();
    return data as Pick<Playlist, 'id' | 'name' | 'created_at'> | null;
  }

  /**
   * Open the create dialog, optionally to hold a shabad the listener tried to
   * add before they had any playlists.
   *
   * Signed-out callers get the sign-in dialog first — the create form would only
   * fail at the insert — but the pick is kept, and `maybeResume` reopens this
   * dialog once the session lands. Dropping it meant the listener came back from
   * signing in to nothing, having to find the row and repeat the whole gesture.
   */
  function promptNew(pick?: { id: string; name: string }) {
    pendingPick.value = pick ?? null;
    if (!user.value) {
      prompt();
      return;
    }
    newOpen.value = true;
  }

  /**
   * Pick up an interrupted "add to playlist" once there is a session.
   *
   * Gated on the sign-in dialog being shut: opening this one while that one is
   * still up puts two focus traps on screen, and which of the two settles first
   * depends on whether Supabase's auth listener fires before or after
   * `signIn()` closes its dialog.
   */
  function maybeResume() {
    if (user.value && pendingPick.value && !promptOpen.value) {
      newOpen.value = true;
    }
  }

  /** Keep the list in step with the session. Called once, from app.vue; see the
   *  note on detached scope in `useFavorites`. */
  function sync() {
    if (scope || import.meta.server) return;
    scope = effectScope(true);
    scope.run(() => {
      watch(
        user,
        (u) => {
          if (!u) {
            playlists.value = [];
            pendingPick.value = null;
            return;
          }
          // Caught, not floated: a rejected request inside a watcher is an
          // unhandled rejection Vue swallows, and `loading` would stay true.
          void load().catch(() => {
            loading.value = false;
          });
          maybeResume();
        },
        { immediate: true }
      );
      // The other order: the session arrives while the sign-in dialog is still
      // open, so the resume waits for that dialog to close.
      watch(promptOpen, () => maybeResume());
    });
  }

  return {
    playlists,
    loading,
    newOpen,
    pendingPick,
    load,
    create,
    rename,
    remove,
    addItem,
    removeItem,
    items,
    get,
    promptNew,
    sync,
  };
}
