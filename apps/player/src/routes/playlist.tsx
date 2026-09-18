/** One playlist, in playlist order. */
import { usePlaylist, usePlaylistItems, usePlaylistMutations } from '@kp/api';
import { Button } from '@kp/ui/button';
import { Link, useParams } from '@tanstack/react-router';
import { ChevronLeft, Play } from 'lucide-react';

import { ShabadList } from '~/components/ShabadList';
import { playerActions } from '~/lib/player';
import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';

export function PlaylistRoute() {
  const { id } = useParams({ from: '/playlists/$id' });
  const { userId } = useSession();
  const playlist = usePlaylist(supabase, id);
  const items = usePlaylistItems(supabase, id);
  usePlaylistMutations(supabase, userId);

  const rows = items.data ?? [];

  return (
    <section className="flex flex-col gap-4">
      <Link
        to="/playlists"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" />
        Playlists
      </Link>

      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{playlist.data?.name ?? 'Playlist'}</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? 'shabad' : 'shabads'}
          </p>
        </div>

        {rows.length ? (
          <Button onClick={() => playerActions.playList(rows, 0)}>
            <Play />
            Play
          </Button>
        ) : null}
      </header>

      <ShabadList
        items={rows}
        loading={items.isLoading}
        empty="Nothing in this playlist yet."
        emptyHint="Use the menu on any shabad to file it here."
      />
    </section>
  );
}
