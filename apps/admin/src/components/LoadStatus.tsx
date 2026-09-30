/**
 * What a page says while its data is not there: loading, offline, or failed
 * with the way out beside it. Nothing once every query has data to show.
 *
 * Every admin page used to gate its empty state on `!isLoading` — which is
 * also true after a failed load, and after a load the browser paused offline —
 * so a failure read as the data itself: "Nothing waiting.", "No accounts
 * match.", a permissions matrix of unticked switches, a tag page with nothing
 * but its back link. Pages now show their empty state only over data, and this
 * over everything else.
 */
import { Button } from '@kp/ui/button';
import { onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { cn } from '~/lib/utils';

/** The parts of a query (or infinite query) result this reads. */
interface Loadable {
  data: unknown;
  isEnabled: boolean;
  errorUpdateCount: number;
  fetchStatus: 'fetching' | 'paused' | 'idle';
  refetch: () => Promise<unknown>;
}

export function LoadStatus({
  what,
  queries,
  retry,
  className,
}: {
  /** Finishes "Could not load …": "the review queue", "this recording". */
  what: string;
  queries: Loadable[];
  /** Defaults to refetching `queries`; a page can retry more than it waits on. */
  retry?: () => void;
  className?: string;
}) {
  // A disabled query has nothing to say, and must not be retried: refetch()
  // runs even a disabled query, and one refused mid-outage then stays in error
  // with nothing to re-run it — an alert on a page that loaded.
  const live = queries.filter((q) => q.isEnabled);
  const waiting = live.filter((q) => q.data === undefined);
  if (!waiting.length) return null;

  const busy = waiting.some((q) => q.fetchStatus === 'fetching');
  let body: ReactNode;
  // Paused is also a hidden tab waiting to retry; only offline is worth saying.
  if (waiting.some((q) => q.fetchStatus === 'paused') && !onlineManager.isOnline()) {
    body = (
      <p className="text-sm text-muted-foreground">
        Offline — this loads when the connection is back.
      </p>
    );
  } else if (!waiting.some((q) => q.errorUpdateCount > 0)) {
    // errorUpdateCount, not isError: a retry puts a query with no data back
    // to pending, and the alert — with the focused button in it — must not
    // vanish for the length of the attempt.
    body = <p className="text-sm text-muted-foreground">Loading…</p>;
  } else {
    body = (
      <>
        <p role="alert" className="text-sm text-destructive">
          Could not load {what}.
        </p>
        <Button
          variant="outline"
          size="sm"
          aria-disabled={busy}
          onClick={() => {
            if (busy) return;
            if (retry) retry();
            else for (const q of live) void q.refetch();
          }}
        >
          {busy ? 'Trying again…' : 'Try again'}
        </Button>
      </>
    );
  }
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{body}</div>;
}
