/**
 * Who is signed in, and where they sit on the trust ladder.
 *
 * Separate from useMyPermissions because it answers a different question:
 * that one asks what you may do, this one names the rung. The badge in the
 * sidebar wants the rung — "admin" is a thing to recognise yourself as, where
 * a list of four booleans is not.
 *
 * Readable without any permission: the profiles SELECT policy admits
 * `id = auth.uid()` on its own, so this works for a contributor too.
 */
export async function useMyProfile() {
  const supabase = useSupabaseClient();

  const { data } = await useAsyncData('my-profile', async () => {
    // getSession, not getUser: getUser spends a network round trip validating
    // the JWT, and this composable blocks the layout's first paint. Nothing
    // here trusts the id — the profiles SELECT policy re-derives auth.uid()
    // server-side, so a tampered local token reads nobody else's row.
    const { data: auth } = await supabase.auth.getSession();
    const user = auth.session?.user;
    if (!user) return null;
    const { data: profile } = await supabase
      .from('profiles')
      .select('trust')
      .eq('id', user.id)
      .single();
    return {
      email: user.email ?? '',
      trust: (profile?.trust as string | undefined) ?? null,
    };
  });

  return {
    email: computed(() => data.value?.email ?? ''),
    trust: computed(() => data.value?.trust ?? null),
  };
}
