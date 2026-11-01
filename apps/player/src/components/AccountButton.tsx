/**
 * The account control, which is a sign-in button until there is a session.
 *
 * Held in its guest state until `loading` clears: flashing an account menu at
 * someone who turns out to be signed out, or the reverse, is worse than a beat
 * of nothing.
 *
 * Saved and Playlists are not in its menu: the sidebar and the phone's Library
 * tab already go there, and a second door to each only asked which to use.
 */
import { signOut } from '@kp/api';
import { AccountMenu } from '@kp/ui/app/account-menu';
import { Button } from '@kp/ui/button';

import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';

export function AccountButton({ variant = 'avatar' }: { variant?: 'avatar' | 'row' }) {
  const { session, loading, prompt } = useSession();

  if (loading) return <div className="size-8" aria-hidden />;

  if (!session) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={prompt}
        className={variant === 'row' ? 'w-full justify-start px-2' : undefined}
      >
        Sign in
      </Button>
    );
  }

  return (
    <AccountMenu
      email={session.user.email ?? ''}
      onSignOut={() => void signOut(supabase)}
      variant={variant}
    />
  );
}
