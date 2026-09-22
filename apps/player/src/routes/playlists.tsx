/**
 * Playlists — account-only.
 *
 * Favorites survive without an account because losing one browser's list costs
 * a few taps to rebuild. A named collection someone spent an hour assembling
 * is not something to keep in localStorage and hope, so this asks for a
 * sign-in rather than degrading.
 */
import { usePlaylistMutations, usePlaylists } from '@kp/api';
import { Button } from '@kp/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@kp/ui/dropdown-menu';
import { Link } from '@tanstack/react-router';
import { ListMusic, MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState } from '~/components/EmptyState';
import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';

export function PlaylistsRoute() {
  const { userId, prompt, openNewPlaylist } = useSession();
  const query = usePlaylists(supabase, Boolean(userId));
  const { remove, rename } = usePlaylistMutations(supabase, userId);

  if (!userId) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="font-display text-3xl font-semibold">Playlists</h1>
        <EmptyState
          title="Playlists need an account."
          hint="A collection you spent time on should not live in one browser's storage."
          action={
            <Button size="sm" onClick={prompt} className="mt-2">
              Sign in
            </Button>
          }
        />
      </section>
    );
  }

  const lists = query.data ?? [];

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold">Playlists</h1>
        <Button size="sm" variant="outline" onClick={() => openNewPlaylist()}>
          <Plus />
          New
        </Button>
      </header>

      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      {!query.isLoading && lists.length === 0 ? (
        <EmptyState
          title="No playlists yet."
          hint="Use the menu on any shabad to file it into one."
        />
      ) : null}

      <div className="flex flex-col gap-0.5">
        {lists.map((playlist) => (
          <div
            key={playlist.id}
            className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/50"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent">
              <ListMusic className="size-4 text-muted-foreground" />
            </div>

            <Link to="/playlists/$id" params={{ id: playlist.id }} className="min-w-0 flex-1">
              <p className="truncate text-sm">{playlist.name}</p>
              <p className="text-xs text-muted-foreground">
                {playlist.count} {playlist.count === 1 ? 'shabad' : 'shabads'}
              </p>
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label={`More for ${playlist.name}`} />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    const name = window.prompt('Rename playlist', playlist.name);
                    if (name && name.trim() && name !== playlist.name) {
                      void rename
                        .mutateAsync({ id: playlist.id, name })
                        .catch(() => toast.error('Could not rename'));
                    }
                  }}
                >
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    // Deleting a collection someone assembled by hand asks first.
                    if (window.confirm(`Delete “${playlist.name}”?`)) {
                      void remove
                        .mutateAsync(playlist.id)
                        .catch(() => toast.error('Could not delete'));
                    }
                  }}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
    </section>
  );
}
