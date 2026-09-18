/**
 * The ragi directory.
 *
 * Photos where SGPC published one, a gradient from the name where it did not —
 * which is most of them, and a grid of grey squares is what makes this look
 * like a database rather than a music app.
 */
import { useArtists } from '@kp/api';
import { Link } from '@tanstack/react-router';

import { ArtTile } from '~/components/ArtTile';
import { EmptyState } from '~/components/EmptyState';
import { artistPhotoUrl, supabase } from '~/lib/supabase';

export function RagisRoute() {
  const query = useArtists(supabase);
  const artists = query.data ?? [];

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Ragis</h1>
        <p className="text-sm text-muted-foreground">
          Everyone with published shabads in the archive.
        </p>
      </header>

      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {query.isError ? (
        <p className="text-sm text-destructive">Could not load the directory.</p>
      ) : null}

      {!query.isLoading && !artists.length ? (
        <EmptyState title="No ragis yet." hint="They appear as shabads are tagged." />
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {artists.map((artist) => (
          <Link
            key={artist.name}
            to="/ragis/$name"
            params={{ name: artist.name }}
            className="flex flex-col items-center gap-2 rounded-xl p-3 text-center hover:bg-accent/50"
          >
            <ArtTile
              name={artist.display_name ?? artist.name}
              src={artistPhotoUrl(artist.photo_path)}
              rounded="full"
              className="size-20 text-2xl"
            />
            <span className="line-clamp-2 text-sm">{artist.display_name ?? artist.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
