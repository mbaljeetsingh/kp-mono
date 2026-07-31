/**
 * Favorites, device-local.
 *
 * Listening never requires an account, so these live in localStorage rather
 * than the database — keyed by the segment's stable id so they migrate into an
 * account as a straight insert if auth ever lands on the player.
 */
export function useFavorites() {
  const ids = useLocalStorage<string[]>('kp:favorites', []);

  const has = (id: string) => ids.value.includes(id);

  function toggle(id: string) {
    ids.value = has(id)
      ? ids.value.filter((x) => x !== id)
      : [...ids.value, id];
  }

  return { ids, has, toggle };
}
