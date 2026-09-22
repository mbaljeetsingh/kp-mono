/**
 * The account control, which is a sign-in button until there is a session.
 *
 * Held in its guest state until `loading` clears: flashing an account menu at
 * someone who turns out to be signed out, or the reverse, is worse than a beat
 * of nothing.
 *
 * The menu itself is shared with the workbench; what the player adds to it is
 * the two library destinations, which are the only things here that know about
 * this app's router.
 */
import { signOut } from '@kp/api';
import { AccountMenu } from '@kp/ui/app/account-menu';
import { Button } from '@kp/ui/button';
import { DropdownMenuItem } from '@kp/ui/dropdown-menu';
import { Link } from '@tanstack/react-router';
import { Heart, ListMusic } from 'lucide-react';

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
    >
      <DropdownMenuItem render={<Link to="/favorites" />}>
        <Heart />
        Saved
      </DropdownMenuItem>
      <DropdownMenuItem render={<Link to="/playlists" />}>
        <ListMusic />
        Playlists
      </DropdownMenuItem>
    </AccountMenu>
  );
}
