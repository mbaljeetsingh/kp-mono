import { useArtists } from '@kp/api';
import { Link } from '@tanstack/react-router';

import { supabase } from '~/lib/supabase';

export function RagisRoute() {
  const query = useArtists(supabase);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Ragis</h1>

      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {query.isError ? (
        <p className="text-sm text-destructive">Could not load the directory.</p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {(query.data ?? []).map((artist) => (
          <Link
            key={artist.name}
            to="/ragis/$name"
            params={{ name: artist.name }}
            className="rounded-lg border border-border px-3 py-3 text-sm hover:bg-accent/50">
            {artist.display_name ?? artist.name}
          </Link>
        ))}
      </div>
    </section>
  );
}
