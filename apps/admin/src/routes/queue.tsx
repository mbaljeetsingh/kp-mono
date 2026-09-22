/**
 * The tagging queue.
 *
 * 42k files is too many to face as a flat list, and they are not equally worth
 * a contributor's time.
 *
 * Which shelf you are looking at belongs to the URL, not to this component.
 * Tagging is a loop — open a recording, mark it, come back for the next one —
 * and coming back is the browser's Back button. Held in component state, the
 * selection dies when the route changes and Back lands everybody on the default
 * shelf no matter which one they were working through.
 */
import { coverageOpen, DONE_SLACK_SECONDS } from '@kp/core';
import {
  SHELF_DEFAULT_SORT,
  SHELF_SORTS,
  useQueuedScanIds,
  useRecordings,
  type Shelf,
  type Sort,
} from '@kp/api';
import { Badge } from '@kp/ui/badge';
import { Button } from '@kp/ui/button';
import { Input } from '@kp/ui/input';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useDebounceValue } from 'usehooks-ts';

import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';
import { clock, cn } from '~/lib/utils';

const SHELVES: { id: Shelf; label: string; hint: string }[] = [
  { id: 'todo', label: 'Not started', hint: 'Nothing tagged yet' },
  { id: 'queued', label: 'Queued', hint: 'Waiting on the scanner' },
  { id: 'started', label: 'In progress', hint: 'Tagged, but not covered' },
  { id: 'done', label: 'Done', hint: 'Published and covered' },
  { id: 'all', label: 'All', hint: 'Everything crawlable' },
];

const SORT_LABELS: Record<Sort, string> = {
  recent: 'Recent activity',
  shortest: 'Shortest first',
  least: 'Least left',
  random: 'Mixed',
};

const TREES = [
  { id: null, label: 'All' },
  { id: 'ragiwise', label: 'Ragiwise' },
  { id: 'puratan', label: 'Puratan' },
];

export function QueueRoute() {
  const navigate = useNavigate({ from: '/' });
  const search = useSearch({ from: '/' });

  const shelf: Shelf = search.shelf ?? 'todo';
  const tree = search.tree ?? null;
  // An explicit pick, or whatever fits the shelf. A pick that the new shelf
  // cannot answer falls back rather than ordering by something with no button.
  const sort: Sort = SHELF_SORTS[shelf].includes(search.sort as Sort)
    ? (search.sort as Sort)
    : SHELF_DEFAULT_SORT[shelf];

  /*
   * Fed from the URL, not from its own state. The whole point of this file is
   * that Back returns a tagger to where they were, and an input holding its own
   * copy of the term broke half of that: the results followed the URL back, the
   * box kept showing what had been typed before.
   */
  const [term] = useDebounceValue(search.q ?? '', 300);

  const { can } = useSession();

  const queued = useQueuedScanIds(supabase, shelf === 'queued');

  const query = useRecordings(supabase, {
    shelf,
    sort,
    tree,
    search: term,
    queuedIds: queued.data ?? [],
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  const set = (next: Partial<typeof search>) =>
    void navigate({ search: (old) => ({ ...old, ...next }), replace: true });

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="font-display text-3xl font-semibold">Tagging queue</h1>
        <p className="text-sm text-muted-foreground">
          A recording you can finish in one sitting is the one worth picking up.
        </p>
      </header>

      {/*
       * The shelves are the page, so they are the only control drawn at full
       * weight: which work you pick up is the decision this screen exists for,
       * and it is re-made every time a tagger comes back for the next
       * recording. Tree and order are set once and forgotten — as a third
       * matching row of pill buttons they claimed the same attention as the
       * thing you actually work.
       */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
        {SHELVES.map((s) => (
          <button
            key={s.id}
            type="button"
            title={s.hint}
            aria-pressed={shelf === s.id}
            onClick={() => set({ shelf: s.id, sort: SHELF_DEFAULT_SORT[s.id] })}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm',
              shelf === s.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <label className="flex items-center gap-1.5">
          Archive
          <select
            value={tree ?? 'all'}
            onChange={(e) => set({ tree: e.target.value === 'all' ? undefined : e.target.value })}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
          >
            {TREES.map((t) => (
              <option key={t.label} value={t.id ?? 'all'}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        {/*
         * Only the orders this shelf can answer — "least left" is meaningless
         * where nothing is tagged — and nothing at all where it can answer
         * only one. Queued and Done have a single order, so the control was a
         * box around one button that was already chosen and did nothing.
         */}
        {SHELF_SORTS[shelf].length > 1 ? (
          <label className="flex items-center gap-1.5">
            Order
            <select
              value={sort}
              onChange={(e) => set({ sort: e.target.value as Sort })}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              {SHELF_SORTS[shelf].map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search.q ?? ''}
          onChange={(e) => set({ q: e.target.value || undefined })}
          placeholder="Ragi, or paste a filename…"
          aria-label="Search recordings"
          className="pl-9"
        />
      </div>

      {query.isError ? <p className="text-sm text-destructive">Could not load the queue.</p> : null}

      {shelf === 'queued' && !can['scans.request'] ? (
        <p className="text-xs text-muted-foreground">
          Scan requests need a permission your account does not have, so this shelf will be empty.
        </p>
      ) : null}

      <div className="flex flex-col gap-0.5">
        {items.map((r) => {
          const open = coverageOpen(r.untagged_seconds);
          return (
            <Link
              key={r.id}
              to="/tag/$id"
              params={{ id: r.id }}
              // Carried so the Back link on the tag page returns the tagger to
              // the shelf they were working through.
              search={(prev) => prev}
              className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent/50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{r.title ?? r.raw_filename ?? r.id}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.artist_dir ?? 'Unknown'}
                  {r.date ? ` · ${r.date}` : ''}
                  {` · ${r.tree}`}
                </p>
              </div>

              {r.tagged_done_at ? (
                <Badge variant="secondary" className="shrink-0">
                  marked done
                </Badge>
              ) : r.renditions > 0 ? (
                <Badge variant="secondary" className="shrink-0">
                  {r.published > 0 ? `${r.published} published` : `${r.renditions} draft`}
                </Badge>
              ) : null}

              {/* The measure the shelves turn on, shown so a tagger can see why
                  a recording is where it is. */}
              {r.untagged_seconds != null && open ? (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {clock(r.untagged_seconds)} left
                </span>
              ) : null}

              {/* Null means no filename slot — all of puratan. Shown as unknown
                  rather than 0:00, which would read as an empty file. */}
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {r.est_seconds ? clock(r.est_seconds) : '—'}
              </span>
            </Link>
          );
        })}

        {query.isLoading || query.isFetchingNextPage ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
        ) : null}

        {!query.isLoading && items.length === 0 ? (
          <p className="px-3 py-8 text-sm text-muted-foreground">
            Nothing on this shelf. Try another filter.
          </p>
        ) : null}

        {query.hasNextPage && !query.isFetchingNextPage ? (
          <Button
            variant="outline"
            onClick={() => void query.fetchNextPage()}
            className="mx-3 mt-2"
          >
            Show more
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        A recording counts as done once it is published and has under{' '}
        {Math.round(DONE_SLACK_SECONDS / 60)} minutes untagged — recordings open with announcements
        and trail off, and no amount of tagging covers those.
      </p>
    </section>
  );
}
