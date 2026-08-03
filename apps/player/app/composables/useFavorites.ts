/**
 * Favorites — device-local when signed out, account-backed when signed in.
 *
 * `has` stays synchronous and `toggle` stays fire-and-forget because both are
 * called straight from row templates (`ShabadRow`, `ShabadMenu`), where an
 * awaited toggle would mean a heart that lags the tap that pressed it. The
 * signed-in path updates the id list optimistically and re-reads from the
 * server only if the write failed.
 *
 * Ids are rendition ids in both modes, which is what lets a guest's list migrate
 * into an account as a straight insert on first sign-in.
 */
import { computed, effectScope, ref, watch } from 'vue';
import { chunk } from '~/lib/utils';

/** The signed-in list, newest first. Empty and unused while signed out. */
const remoteIds = ref<string[]>([]);
let scope: ReturnType<typeof effectScope> | null = null;

/**
 * In-flight write per rendition id, so two toggles of the same heart run in
 * order. Without this a double tap fires an insert and a delete concurrently
 * and the server keeps whichever finishes last — leaving the row saved while
 * the UI shows it unsaved, or the reverse.
 */
const writes = new Map<string, Promise<unknown>>();

export function useFavorites() {
  const supabase = useSupabaseClient();
  const { user } = useAuth();
  /**
   * `initOnMounted` is what keeps hydration quiet.
   *
   * Without it useLocalStorage reads storage during setup, so the server
   * renders every heart empty and the client's FIRST render already has them
   * filled — a mismatch Vue reports as an error, on every row, for any guest
   * with saves. Deferring the read to onMounted makes the first client render
   * agree with the server; the hearts fill a tick later, after hydration, which
   * is a paint nobody perceives and the only correct order available: the
   * server cannot know what is in a guest's browser.
   */
  const localIds = useLocalStorage<string[]>('kp:favorites', [], {
    initOnMounted: true,
  });

  const ids = computed(() => (user.value ? remoteIds.value : localIds.value));

  const has = (id: string) => ids.value.includes(id);

  async function load() {
    if (!user.value) return;
    const { data, error } = await supabase
      .from('favorites')
      .select('rendition_id')
      .order('created_at', { ascending: false });
    // Keep whatever is on screen if the read failed. Writing `[]` here would
    // turn one dropped request into "Nothing saved yet" over an account that
    // has hundreds of favorites, and un-fill every heart in the list.
    if (error) return;
    remoteIds.value = (data ?? []).map((r) => r.rendition_id as string);
  }

  /**
   * Move a guest's device-local list into their account, once.
   *
   * The ids are filtered through `shabads` first because a single id whose
   * rendition has since been deleted or unpublished would fail the whole insert
   * on its foreign key, taking the rest of the list down with it.
   *
   * localStorage is the only copy of this list, so it is cleared only once the
   * whole move has demonstrably landed — every lookup batch answered, and the
   * insert accepted. Anything less and a failure here would delete a guest's
   * years of saves instead of retrying on the next sign-in.
   */
  async function migrateLocal(userId: string) {
    const local = localIds.value;
    if (!local.length) return;

    // Batched: this filter is a query string, and a long-standing guest's list
    // is long enough to break the request outright. See `chunk`.
    const lookups = await Promise.all(
      chunk(local).map((batch) =>
        supabase.from('shabads').select('id').in('id', batch)
      )
    );
    if (lookups.some((r) => r.error)) return;
    const live = lookups
      .flatMap((r) => r.data ?? [])
      .map((r) => r.id as string);

    if (live.length) {
      const { error } = await supabase.from('favorites').upsert(
        live.map((id) => ({ user_id: userId, rendition_id: id })),
        { onConflict: 'user_id,rendition_id', ignoreDuplicates: true }
      );
      if (error) return;
    }
    localIds.value = [];
  }

  function toggle(id: string) {
    const u = user.value;

    if (!u) {
      localIds.value = has(id)
        ? localIds.value.filter((x) => x !== id)
        : [...localIds.value, id];
      return;
    }

    const adding = !has(id);
    remoteIds.value = adding
      ? [id, ...remoteIds.value]
      : remoteIds.value.filter((x) => x !== id);

    // Queued behind any write still in flight for this same id, so a double tap
    // ends up in the state the last tap asked for rather than a coin flip.
    const write = (writes.get(id) ?? Promise.resolve())
      .then(() =>
        adding
          ? supabase
              .from('favorites')
              .insert({ user_id: u.id, rendition_id: id })
          : supabase
              .from('favorites')
              .delete()
              .eq('user_id', u.id)
              .eq('rendition_id', id)
      )
      .then(({ error }) => {
        // The optimistic list is a guess once the write fails; take the
        // server's answer rather than leaving a heart filled for something
        // that was never saved.
        if (error) void load();
      })
      .catch(() => {
        // A rejected request (offline, gateway) lands here rather than as an
        // error row, and must not leave a poisoned promise in the map.
        void load();
      })
      .finally(() => {
        if (writes.get(id) === write) writes.delete(id);
      });

    writes.set(id, write);
  }

  /**
   * Keep the list in step with the session. Called once, from app.vue.
   *
   * The watcher lives in a detached effect scope on purpose: `useFavorites` is
   * called from row components that mount and unmount constantly, and a watcher
   * owned by the first row to render would stop the moment that row scrolled
   * out of the list.
   */
  function sync() {
    if (scope || import.meta.server) return;
    scope = effectScope(true);
    scope.run(() =>
      watch(
        user,
        async (u) => {
          if (!u) {
            remoteIds.value = [];
            return;
          }
          try {
            await migrateLocal(u.id);
            await load();
          } catch {
            // A rejected request here would otherwise be an unhandled rejection
            // inside a watcher, which Vue swallows — and the sync would be dead
            // for the rest of the session with nothing on screen to say so.
          }
        },
        { immediate: true }
      )
    );
  }

  return { ids, has, toggle, sync };
}
