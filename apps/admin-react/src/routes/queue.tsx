/**
 * The tagging queue.
 *
 * 42k files is too many to face as a flat list, and they are not equally worth
 * a contributor's time — shortest first is what lets someone finish a recording
 * in one sitting, which is what keeps a volunteer coming back.
 */
import { useRecordings, type Shelf } from '@kp/api';
import { Badge } from '@kp/ui/badge';
import { Button } from '@kp/ui/button';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { supabase } from '~/lib/supabase';
import { clock, cn } from '~/lib/utils';

const SHELVES: { id: Shelf; label: string; hint: string }[] = [
  { id: 'todo', label: 'Todo', hint: 'Nothing tagged yet' },
  { id: 'progress', label: 'In progress', hint: 'Has drafts, nothing published' },
  { id: 'done', label: 'Done', hint: 'Something published' },
];

const TREES = [
  { id: null, label: 'All' },
  { id: 'ragiwise', label: 'Ragiwise' },
  { id: 'puratan', label: 'Puratan' },
];

export function QueueRoute() {
  const [shelf, setShelf] = useState<Shelf>('todo');
  const [tree, setTree] = useState<string | null>(null);
  const query = useRecordings(supabase, shelf, tree);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Tagging queue</h1>
        <p className="text-sm text-muted-foreground">
          Shortest first — a recording you can finish in one sitting.
        </p>
      </header>

      <div className="flex flex-wrap gap-4">
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {SHELVES.map((s) => (
            <button
              key={s.id}
              type="button"
              title={s.hint}
              aria-pressed={shelf === s.id}
              onClick={() => setShelf(s.id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm',
                shelf === s.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
              )}>
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1 rounded-lg border border-border p-1">
          {TREES.map((t) => (
            <button
              key={t.label}
              type="button"
              aria-pressed={tree === t.id}
              onClick={() => setTree(t.id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm',
                tree === t.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
              )}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {query.isError ? (
        <p className="text-sm text-destructive">Could not load the queue.</p>
      ) : null}

      <div className="flex flex-col gap-0.5">
        {items.map((r) => (
          <Link
            key={r.id}
            to="/tag/$id"
            params={{ id: r.id }}
            className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent/50">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{r.title ?? r.raw_filename ?? r.id}</p>
              <p className="truncate text-xs text-muted-foreground">
                {r.artist_dir ?? 'Unknown'}
                {r.date ? ` · ${r.date}` : ''}
                {` · ${r.tree}`}
              </p>
            </div>

            {r.renditions > 0 ? (
              <Badge variant="secondary" className="shrink-0">
                {r.published > 0 ? `${r.published} published` : `${r.renditions} draft`}
              </Badge>
            ) : null}

            {/* Null means no filename slot — all of puratan. Shown as unknown
                rather than 0:00, which would read as an empty file. */}
            <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {r.est_seconds ? clock(r.est_seconds) : '—'}
            </span>
          </Link>
        ))}

        {query.isLoading || query.isFetchingNextPage ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
        ) : null}

        {!query.isLoading && items.length === 0 ? (
          <p className="px-3 py-8 text-sm text-muted-foreground">
            Nothing on this shelf. Try another filter.
          </p>
        ) : null}

        {query.hasNextPage && !query.isFetchingNextPage ? (
          <Button variant="outline" onClick={() => void query.fetchNextPage()} className="mx-3 mt-2">
            Show more
          </Button>
        ) : null}
      </div>
    </section>
  );
}
