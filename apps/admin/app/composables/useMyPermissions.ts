/**
 * What this account may actually do, asked one permission at a time.
 *
 * The admin used to gate every control on `is_reviewer()`, which is a single
 * permission — `renditions.review` — standing in for three. That quietly cost
 * the `trusted` role the thing it exists for: it holds `renditions.publish`
 * without `review`, so RLS would accept a trusted tagger publishing their own
 * draft while the UI showed them a read-only badge and no button. Delete is a
 * third permission again.
 *
 * Shared so the tagging page and the review queue cannot drift into disagreeing
 * about who may do what, and cached under one key so the three round trips
 * happen once per session rather than once per page.
 */
export async function useMyPermissions() {
  const supabase = useSupabaseClient();

  // Awaited, so callers never render a decision made on a null answer. The
  // tagging page opens a row for editing on mount when the review queue links
  // to it, and that check has to know the permissions by then or it silently
  // declines to open anything.
  const { data } = await useAsyncData('my-perms', async () => {
    const ask = async (requested: string) => {
      const { data } = await supabase.rpc('authorize', { requested });
      return data === true;
    };
    const [review, publish, remove] = await Promise.all([
      ask('renditions.review'),
      ask('renditions.publish'),
      ask('renditions.delete'),
    ]);
    return { review, publish, remove };
  });

  return {
    /** Edit and publish anything, and see the exact status behind "Unpublished". */
    canReview: computed(() => data.value?.review === true),
    /** Promote work to published — on its own, only your own unpublished work. */
    canPublish: computed(() => data.value?.publish === true),
    /** Remove a rendition outright. Granted only alongside review. */
    canDelete: computed(() => data.value?.remove === true),
  };
}

/**
 * Whether this row can be promoted to published by this user.
 *
 * Reviewers can do it to anything. Publish-without-review can only do it to
 * their own unpublished work, and only once: the UPDATE policy stops matching
 * the row the moment it goes published, which is why those users get a one-way
 * button where a reviewer gets a two-state control.
 */
export function canPublishRendition(
  row: { status: string; created_by: string | null },
  perms: { canReview: boolean; canPublish: boolean },
  // Undefined as well as null: this comes from `useAsyncData`, which has no
  // value at all until it resolves, and "we do not know who you are yet" must
  // fall through to the same answer as "you are nobody" — no button.
  userId: string | null | undefined
) {
  if (!perms.canPublish || row.status === 'published') return false;
  return perms.canReview || row.created_by === userId;
}
