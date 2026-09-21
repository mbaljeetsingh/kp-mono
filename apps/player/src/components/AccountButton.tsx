/**
 * The account control, which is a sign-in button until there is a session.
 *
 * Held in its guest state until `loading` clears: flashing an account menu at
 * someone who turns out to be signed out, or the reverse, is worse than a beat
 * of nothing.
 */
import { signOut } from '@kp/api';
import { Avatar, AvatarFallback } from '@kp/ui/avatar';
import { Button } from '@kp/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kp/ui/dropdown-menu';
import { Link } from '@tanstack/react-router';
import { Heart, ListMusic, LogOut } from 'lucide-react';

import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';

export function AccountButton() {
  const { session, loading, prompt } = useSession();

  if (loading) return <div className="size-8" aria-hidden />;

  if (!session) {
    return (
      <Button variant="ghost" size="sm" onClick={prompt}>
        Sign in
      </Button>
    );
  }

  const email = session.user.email ?? '';
  const initial = email.slice(0, 1).toUpperCase() || '?';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account" />
        }
      >
        <Avatar className="size-7">
          <AvatarFallback className="text-xs">{initial}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/favorites" />}>
          <Heart />
          Saved
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link to="/playlists" />}>
          <ListMusic />
          Playlists
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut(supabase)}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
