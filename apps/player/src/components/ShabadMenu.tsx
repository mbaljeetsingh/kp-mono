/**
 * The per-row menu: queue it, save it, file it.
 *
 * The playlist submenu reads the already-loaded list rather than fetching —
 * one request per visible row is what a naive version costs.
 */
import { usePlaylistMutations, usePlaylists } from '@kp/api';
import type { Playable } from '@kp/core';
import { Button } from '@kp/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kp/ui/dropdown-menu';
import { Heart, ListPlus, MoreHorizontal, Plus, Users } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';

import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';
import { playerActions } from '~/lib/player';

export function ShabadMenu({ item }: { item: Playable }) {
  const navigate = useNavigate();
  const { userId, favorites, prompt, openNewPlaylist } = useSession();
  // Read out here so the menu item's handler closes over a string rather than
  // a property TypeScript will not narrow inside a callback.
  const artist = item.artist;
  const playlists = usePlaylists(supabase, Boolean(userId));
  const { addItem } = usePlaylistMutations(supabase, userId);

  const saved = favorites.has(item.id);
  const lists = playlists.data ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`More for ${item.title}`} />}
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/* The row itself plays, so this is where the ragi went: naming them in
            the menu costs a tap, and it costs it to the person who wants the
            ragi rather than to everybody who wants the shabad.
            `artist` and not `subtitle`, because the route keys on the stored
            name while the display name is the one worth reading. */}
        {artist ? (
          <DropdownMenuItem
            onClick={() => void navigate({ to: '/ragis/$name', params: { name: artist } })}
          >
            <Users />
            View ragi
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuItem onClick={() => playerActions.addToQueue(item)}>
          <ListPlus />
          Add to queue
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => favorites.toggle(item.id)}>
          <Heart />
          {saved ? 'Remove from saved' : 'Save'}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          Add to playlist
        </DropdownMenuLabel>

        {!userId ? (
          // Asking for a sign-in beats a create form that would only fail at
          // the insert — playlists are account-only by design.
          <DropdownMenuItem onClick={prompt}>Sign in to use playlists</DropdownMenuItem>
        ) : (
          <>
            {lists.map((playlist) => (
              <DropdownMenuItem
                key={playlist.id}
                onClick={() => {
                  void addItem
                    .mutateAsync({ playlistId: playlist.id, renditionId: item.id })
                    .then((inserted) =>
                      toast.success(
                        inserted ? `Added to ${playlist.name}` : `Already in ${playlist.name}`
                      )
                    )
                    .catch(() => toast.error('Could not add to that playlist'));
                }}
              >
                {playlist.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => openNewPlaylist({ id: item.id, name: item.title })}>
              <Plus />
              New playlist…
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
