/**
 * Everything on the Recently played shelf, which shows only the latest few.
 *
 * Plain on purpose: `recent_plays` holds one row per rendition with its latest
 * play, so there are no repeat plays to show, and no dates worth grouping by.
 */
import { useRecentShabads } from '@kp/api';
import { Button } from '@kp/ui/button';

import { ShabadList } from '~/components/ShabadList';
import { usePlayer } from '~/lib/player';
import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';

export function RecentRoute() {
  const { userId } = useSession();
  const ids = usePlayer((s) => s.recentIds);
  const ready = usePlayer((s) => s.recentReady);

  const query = useRecentShabads(supabase, ids);

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="font-display text-3xl font-semibold">Recently played</h1>
        <p className="text-sm text-muted-foreground">
          {userId ? 'Follows your account.' : 'Kept on this device.'}
        </p>
      </header>

      {/* A failed read is not an empty list, as on Saved. */}
      {query.isError && query.data === undefined ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-destructive">
            Could not load what you played.
          </p>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <ShabadList
          items={query.data ?? []}
          // Until storage has been read, no ids does not yet mean nothing played;
          // and ids with no rows yet may be a request held for a connection.
          loading={!ready || (ids.length > 0 && query.isPending)}
          empty="Nothing played yet."
          emptyHint="Shabads you play will appear here."
        />
      )}
    </section>
  );
}
