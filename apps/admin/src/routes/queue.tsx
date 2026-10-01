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
  requestScan,
  rescan,
  SHELF_DEFAULT_SORT,
  SHELF_SORTS,
  useRecordings,
  useScanStates,
  useSuggestedCount,
  type ScanRequestState,
  type Shelf,
  type Sort,
} from '@kp/api';
import { Badge } from '@kp/ui/badge';
import { Button } from '@kp/ui/button';
import { Input } from '@kp/ui/input';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ChevronRight, ListChecks, Search, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useDebounceValue } from 'usehooks-ts';

import { LoadStatus } from '~/components/LoadStatus';
import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';
import { clock, cn } from '~/lib/utils';

const SHELVES: { id: Shelf; label: string; hint: string }[] = [
  { id: 'todo', label: 'Not started', hint: 'Nothing tagged yet' },
  { id: 'started', label: 'In progress', hint: 'Tagged, but not covered' },
  // Not "review": the Review page is every draft waiting for approval, and two
  // names that close read as one place.
  { id: 'suggested', label: 'Suggested', hint: 'Scan drafts waiting for someone' },
  { id: 'done', label: 'Done', hint: 'Published and covered' },
  { id: 'all', label: 'All', hint: 'Everything crawlable' },
];

const SORT_LABELS: Record<Sort, string> = {
  recent: 'Recent activity',
  shortest: 'Shortest first',
  least: 'Least left',
  random: 'Mixed',
  drafts: 'Most drafts',
};

/**
 * When a recording was scanned and who asked, as the Suggested shelf says it:
 * "scanned today, nobody asked" is how a reviewer tells the nightly scan's
 * picks from a tagger's click. Nothing when no request is on record.
 */
function scanNote(request: ScanRequestState | undefined, userId: string | null): string {
  if (!request?.done_at) return '';
  const days = Math.floor(
    (startOfDay(Date.now()) - startOfDay(Date.parse(request.done_at))) / 86_400_000
  );
  const when =
    days <= 0 ? 'scanned today' : days === 1 ? 'scanned yesterday' : `scanned ${days} days ago`;
  const who = !request.requested_by
    ? 'nobody asked'
    : request.requested_by === userId
      ? 'you asked'
      : 'a tagger asked';
  return `${when}, ${who}`;
}
const startOfDay = (t: number) => new Date(t).setHours(0, 0, 0, 0);

const TREES = [
  { id: null, label: 'All' },
  { id: 'ragiwise', label: 'Ragiwise' },
  { id: 'puratan', label: 'Puratan' },
];

export function QueueRoute() {
  const navigate = useNavigate({ from: '/' });
  const search = useSearch({ from: '/' });

  const { can, userId, permissionsLoading } = useSession();
  // Reviewers' shelf: the drafts on it belong to nobody when the nightly scan
  // picked the recording, and only reviewers can see — or publish — those. A
  // link to it for anyone else lands on the default shelf.
  const canReview = can['renditions.review'];
  const asked: Shelf = search.shelf ?? 'todo';
  const shelf: Shelf = asked === 'suggested' && !permissionsLoading && !canReview ? 'todo' : asked;
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

  // Requesting a scan is its own capability (20260826000100). RLS refuses it
  // anyway; hiding the control keeps the list from offering an action that
  // could only come back as an error.
  const canScan = can['scans.request'];
  // Read by the Suggested shelf too, for when each was scanned and who asked.
  const scans = useScanStates(supabase, canScan || canReview);
  const suggestedCount = useSuggestedCount(supabase, canReview);
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState<string | null>(null);
  // Keyed by track: a refusal belongs to the row that earned it, not to a line
  // at the top of a list the tagger has scrolled a long way down.
  const [askError, setAskError] = useState<Record<string, string>>({});
  const scanState = (id: string): ScanState => scans.data?.[id]?.state ?? 'none';
  const suggest = (id: string, again: boolean) => {
    if (!userId) return;
    setAsking(id);
    setAskError(({ [id]: _, ...rest }) => rest);
    void (again ? rescan(supabase, id, userId) : requestScan(supabase, id, userId))
      .then(() =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ['scan-requests'] }),
          queryClient.invalidateQueries({ queryKey: ['scan-request', id] }),
        ])
      )
      .catch((e) =>
        setAskError((m) => ({
          ...m,
          [id]: e instanceof Error ? e.message : 'Could not ask for suggestions',
        }))
      )
      .finally(() => setAsking(null));
  };

  const query = useRecordings(supabase, {
    shelf,
    sort,
    tree,
    search: term,
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
        {SHELVES.filter((s) => s.id !== 'suggested' || canReview).map((s) => (
          <button
            key={s.id}
            type="button"
            title={s.hint}
            aria-pressed={shelf === s.id}
            onClick={() => set({ shelf: s.id, sort: SHELF_DEFAULT_SORT[s.id] })}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm',
              shelf === s.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
            )}
          >
            {s.label}
            {/* The nightly scan fills this shelf with nobody asking, so it says
            how much is there before anyone opens it. */}
            {s.id === 'suggested' && suggestedCount.data ? (
              <span className="rounded-full border border-current/30 px-1.5 text-[11px] leading-4 tabular-nums">
                {suggestedCount.data}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {shelf === 'suggested' ? (
        <p className="-mt-2 text-xs text-muted-foreground">
          Recordings the scanner suggested shabads for. Check the edges and publish, or delete the
          ones that are wrong.
        </p>
      ) : null}

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
         * only one. Done has a single order, so the control was a
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
                  {shelf === 'suggested' && s === 'recent' ? 'Newest drafts' : SORT_LABELS[s]}
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

      <LoadStatus what="the queue" queries={[query]} />

      <div className="flex flex-col gap-0.5">
        {items.map((r) => {
          const open = coverageOpen(r.untagged_seconds);
          const suggested = shelf === 'suggested';
          return (
            <div key={r.id}>
              <div className="flex items-center rounded-lg hover:bg-accent/50">
                <Link
                  to="/tag/$id"
                  params={{ id: r.id }}
                  // Carried so the Back link on the tag page returns the tagger to
                  // the shelf they were working through.
                  search={(prev) => prev}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{r.title ?? r.raw_filename ?? r.id}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.artist_dir ?? 'Unknown'}
                      {r.date ? ` · ${r.date}` : ''}
                      {` · ${r.tree}`}
                      {suggested && scanNote(scans.data?.[r.id], userId)
                        ? ` · ${scanNote(scans.data?.[r.id], userId)}`
                        : ''}
                    </p>
                  </div>

                  {suggested ? (
                    <>
                      <Badge className="shrink-0 bg-primary/15 text-primary">
                        {r.scan_drafts} {r.scan_drafts === 1 ? 'draft' : 'drafts'}
                      </Badge>
                      {r.published > 0 ? (
                        <Badge variant="secondary" className="shrink-0">
                          {r.published} published
                        </Badge>
                      ) : null}
                    </>
                  ) : r.tagged_done_at ? (
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
                  {!suggested && r.untagged_seconds != null && open ? (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {clock(r.untagged_seconds)} left
                    </span>
                  ) : null}

                  {/* Null means no filename slot — all of puratan. Shown as unknown
                  rather than 0:00, which would read as an empty file. */}
                  <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {r.est_seconds ? clock(r.est_seconds) : '—'}
                  </span>
                  {suggested ? (
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  ) : null}
                </Link>
                {/* Not for puratan: a puratan file is one shabad, and its tag page
                names it from the filename the moment it opens. */}
                {/* Scanned already, and the row is the way in: no Suggest here. */}
                {!suggested && canScan && scans.data !== undefined && r.tree !== 'puratan' ? (
                  <SuggestButton
                    name={r.title ?? r.raw_filename ?? r.id}
                    state={scanState(r.id)}
                    busy={asking === r.id}
                    onAsk={() => suggest(r.id, scanState(r.id) !== 'none')}
                  />
                ) : null}
              </div>
              {askError[r.id] ? (
                <p role="alert" className="px-3 pb-1 text-xs text-destructive">
                  {askError[r.id]}
                </p>
              ) : null}
            </div>
          );
        })}

        {query.isFetchingNextPage ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
        ) : null}
        {query.isFetchNextPageError ? (
          <p role="alert" className="px-3 py-2 text-sm text-destructive">
            Could not load more.
          </p>
        ) : null}

        {query.data !== undefined && items.length === 0 ? (
          shelf === 'suggested' && !term ? (
            <div className="flex flex-col items-center gap-1 rounded-lg bg-muted/40 px-3 py-8 text-center">
              <ListChecks className="size-5 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">No suggestions waiting</p>
              <p className="text-xs text-muted-foreground">
                Each night the scanner suggests shabads for up to three recordings nobody asked for.
                They show up here.
              </p>
            </div>
          ) : (
            <p className="px-3 py-8 text-sm text-muted-foreground">
              Nothing on this shelf. Try another filter.
            </p>
          )
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

type ScanState = 'none' | 'queued' | 'failed' | 'done';

/**
 * A quiet side door on the row, as the Vue queue had: ask the scanner to
 * suggest shabads without opening the recording. Secondary on purpose —
 * tagging by ear stays the main act. Beside the row's link rather than inside
 * it: a button nested in a link is two controls in one to a screen reader, and
 * every click on it would have to fight the navigation.
 */
function SuggestButton({
  name,
  state,
  busy,
  onAsk,
}: {
  name: string;
  state: ScanState;
  busy: boolean;
  onAsk: () => void;
}) {
  if (state === 'queued') {
    return (
      <span
        className="mr-3 shrink-0 text-[11px] text-muted-foreground/70"
        title="Being scanned — its drafts appear on the recording's page when it finishes"
      >
        queued
      </span>
    );
  }
  // A finished scan is an answer, not a dead end: "nothing found" is worth
  // asking again once the scanner improves. A failed one read "queued" for
  // good before, with no way to ask again from here.
  const again = state === 'done' || state === 'failed';
  const failed = state === 'failed';
  return (
    <Button
      variant="ghost"
      size="sm"
      className={`mr-1 h-7 shrink-0 px-2 text-[11px] ${failed ? 'text-destructive' : 'text-muted-foreground'}`}
      disabled={busy}
      onClick={onAsk}
      aria-label={
        failed
          ? `Scan of ${name} failed; scan it again`
          : again
            ? `Scan ${name} again`
            : `Suggest shabads for ${name}`
      }
      title={
        failed
          ? 'The last scan failed — the recording’s page says why. Ask again'
          : again
            ? 'Scanned already — ask again (the scanner may have improved since)'
            : 'Scan this recording for shabad suggestions'
      }
    >
      <Sparkles className="size-3.5" />
      {failed ? 'Scan failed, retry' : again ? 'Suggest again' : 'Suggest'}
    </Button>
  );
}
