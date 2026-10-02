/**
 * The review queue.
 *
 * Everything a contributor proposes lands here. Nothing reaches the player
 * until somebody publishes it, which is the only thing the trust ladder gates.
 */
import {
  deleteRendition,
  canDeleteRendition,
  publishRefusal,
  setRenditionStatus,
  usePending,
  usePendingCount,
  type PendingRendition,
} from '@kp/api';
import { hasReachedEnd, segmentStart, toPlayable, type Playable } from '@kp/core';
import { Badge } from '@kp/ui/badge';
import { Button } from '@kp/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Check, Pause, Play, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { LoadStatus } from '~/components/LoadStatus';
import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';
import { clock } from '~/lib/utils';

const PREVIEW_FAILED = 'Could not play that preview.';

/**
 * Stops the preview and lets go of its recording. Pausing alone left the
 * element holding its file, so a media key could start it again on a page with
 * no button for it. Paused first so `pause` still fires — the load below would
 * stop it silently.
 */
function release(node: HTMLAudioElement) {
  node.pause();
  node.removeAttribute('src');
  node.load();
}

export function PendingRoute() {
  const { session, can } = useSession();
  const query = usePending(supabase, Boolean(session));
  const count = usePendingCount(supabase, Boolean(session));
  const queryClient = useQueryClient();

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * Created in JS rather than rendered, so nothing tears it down on
   * navigation — without the cleanup below a preview keeps playing after the
   * reviewer has left the page, with no UI left to stop it.
   *
   * One element for the whole list, so starting a row stops the last one —
   * the button only ever shows Pause on one row. `previewing` is the row it
   * holds, as a Playable, so where a segment starts and ends is @kp/core's
   * rule here too.
   */
  const audio = useRef<HTMLAudioElement | null>(null);
  const previewing = useRef<Playable | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    const node = new Audio();
    node.preload = 'metadata';
    // The button follows the element, not the click: the segment's end, a
    // failed fetch and Pause all stop it.
    node.addEventListener('play', () => setPlaying(previewing.current?.id ?? null));
    node.addEventListener('pause', () => setPlaying(null));
    node.addEventListener('playing', () =>
      setError((shown) => (shown === PREVIEW_FAILED ? null : shown))
    );
    node.addEventListener('error', () => {
      // A failed element still reports `paused === false`, so the next click
      // read as Pause and the row could never be retried. Forgetting the row
      // makes that click load it afresh. Said here rather than only from
      // play(): a stream that drops mid-way has no promise left to reject.
      previewing.current = null;
      setPlaying(null);
      setError(PREVIEW_FAILED);
    });
    // The segment, not the rest of the recording behind it — played on, a
    // preview ran into the next shabad and kept going with nothing to say so.
    node.addEventListener('timeupdate', () => {
      if (hasReachedEnd(previewing.current, node.currentTime)) node.pause();
    });
    audio.current = node;
    return () => release(node);
  }, []);

  function preview(row: PendingRendition) {
    const node = audio.current;
    const url = row.tracks?.url;
    if (!node || !url) return;
    const held = previewing.current;
    const same = held?.id === row.id;
    if (same && !node.paused) {
      node.pause();
      return;
    }
    // From the row every time, so a re-cut the list has refetched since is
    // the one that plays.
    const item = toPlayable({ ...row, url });
    previewing.current = item;
    // Another recording loads; another row of the same one only seeks.
    // Setting src, even to the same URL, throws the loaded file away.
    if (held?.url !== url) node.src = url;
    // A paused row resumes where it stopped. A finished one starts again, and
    // so does one that ran off the end of its file — play() on an ended
    // element starts the whole recording over from 0:00.
    if (!same || node.ended || hasReachedEnd(item, node.currentTime)) {
      node.currentTime = segmentStart(item);
    }
    // A seek between rows of one playing recording fires no `play` event.
    if (!node.paused) setPlaying(row.id);
    void node.play().catch((failure: unknown) => {
      // Superseded — another row, or Pause before it started — isn't a
      // failure. Ending before it began is: the file is shorter than the tag.
      if (failure instanceof DOMException && failure.name === 'AbortError' && !node.ended) return;
      setError(PREVIEW_FAILED);
    });
  }

  async function run(id: string, work: () => Promise<unknown>) {
    setError(null);
    setBusy(id);
    try {
      await work();
      // The list and its count. Every loaded page refetches in turn, each after
      // the last row of the one before, so the row that just went drops out
      // without losing the pages below it.
      await queryClient.invalidateQueries({ queryKey: ['pending'] });
      await queryClient.invalidateQueries({ queryKey: ['recordings'] });
      // And the tag page's copies, cached for five minutes: its rows, its
      // counts, and its scan pointers — rejecting a scan draft drops the
      // pointers to that shabad too.
      await queryClient.invalidateQueries({ queryKey: ['renditions'] });
      await queryClient.invalidateQueries({ queryKey: ['recording'] });
      await queryClient.invalidateQueries({ queryKey: ['scan-request'] });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  }

  // Deduped by id, though pages continue after a row and should never repeat
  // one: a duplicate key would make React drop or reorder a row's controls.
  const rows = [
    ...new Map(query.data?.pages.flatMap((p) => p.items).map((r) => [r.id, r])).values(),
  ];

  // A preview whose row has left the list — published or rejected, here or by
  // another reviewer — has lost the only button that could stop it.
  const orphaned = playing !== null && !rows.some((r) => r.id === playing);
  useEffect(() => {
    if (!orphaned || !audio.current) return;
    previewing.current = null;
    release(audio.current);
  }, [orphaned]);

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="font-display text-3xl font-semibold">
          Review{' '}
          {count.data !== undefined ? (
            <span className="text-base font-normal text-muted-foreground">({count.data})</span>
          ) : null}
        </h1>
        <p className="text-sm text-muted-foreground">
          Proposed segments, oldest first. Nothing here is in the player yet.
        </p>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <LoadStatus what="the review queue" queries={[query]} />

      {query.data !== undefined && !rows.length ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing waiting. Every proposed segment has been dealt with.
        </p>
      ) : null}

      <div className="flex flex-col gap-0.5">
        {rows.map((row) => {
          const mine = row.created_by === session?.user.id;
          const refusal = publishRefusal(
            row,
            { review: can['renditions.review'], publish: can['renditions.publish'] },
            session?.user.id
          );

          return (
            <div
              key={row.id}
              className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent/50"
            >
              {/* A real basis, so a narrow window moves the controls under the
                  name instead of cutting it to a few letters — as one group,
                  or Reject wrapped onto a line of its own. */}
              <div className="min-w-0 grow basis-40">
                <Link
                  to="/tag/$id"
                  params={{ id: row.track_id }}
                  // From review there is no shelf to preserve — the tagger
                  // arrived from a different list entirely. The row itself
                  // rides along, so the page opens on it.
                  search={{ rendition: row.id }}
                  // Block, or truncate does nothing — a link is inline, and a
                  // long name ran on behind the status badge. w-fit keeps the
                  // link as wide as its text; max-w-full caps that at the
                  // column, without which w-fit undoes the truncate.
                  className="block w-fit max-w-full truncate text-sm hover:underline"
                >
                  {row.name}
                </Link>
                {/* Both titles the rendition goes out with, so the one under
                    review is the one that is published. */}
                {row.name_gurmukhi ? (
                  <p lang="pa" className="truncate font-gurbani text-sm">
                    {row.name_gurmukhi}
                  </p>
                ) : null}
                <p className="truncate text-xs text-muted-foreground">
                  {row.tracks?.artist_dir ?? 'Unknown'}
                  {row.tracks?.date ? ` · ${row.tracks.date}` : ''}
                  {` · ${clock(Number(row.start_sec))}–${clock(Number(row.end_sec))}`}
                  {mine ? ' · yours' : ''}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <Badge variant="secondary" className="shrink-0">
                  {row.status}
                </Badge>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={playing === row.id ? `Pause ${row.name}` : `Preview ${row.name}`}
                  onClick={() => preview(row)}
                >
                  {playing === row.id ? <Pause /> : <Play />}
                </Button>

                {refusal === null ? (
                  <Button
                    size="sm"
                    disabled={busy === row.id}
                    onClick={() =>
                      void run(row.id, () => setRenditionStatus(supabase, row.id, 'published'))
                    }
                  >
                    <Check />
                    Publish
                  </Button>
                ) : refusal === 'needs-shabad' || refusal === 'needs-line' ? (
                  // Where the button would be, so its absence explains itself:
                  // the draft opens on the tag page, where the line is chosen.
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {refusal === 'needs-shabad'
                      ? 'Link a shabad to publish'
                      : 'Choose its main verse to publish'}
                  </span>
                ) : null}

                {canDeleteRendition(
                  row,
                  { propose: can['renditions.propose'], delete: can['renditions.delete'] },
                  session?.user.id
                ) ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Reject ${row.name}`}
                    disabled={busy === row.id}
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      // The prompt blocks the page, and with it the stop at a
                      // segment's end: a preview left playing ran on into the
                      // next shabad for as long as the prompt was open.
                      audio.current?.pause();
                      // Rejecting throws away someone's listening, so it asks.
                      if (
                        window.confirm(
                          `Reject “${row.name}”? This deletes the draft.${row.source === 'scan' ? " The scanner won't suggest it for this recording again." : ''}`
                        )
                      ) {
                        void run(row.id, () => deleteRendition(supabase, row.id));
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
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

      {/* Said rather than left blank: a contributor who cannot publish should
          know that is a trust level, not a broken page. */}
      {!can['renditions.publish'] && rows.length ? (
        <p className="text-xs text-muted-foreground">
          You can see the queue but not publish from it — that comes with the trust ladder.
        </p>
      ) : null}
    </section>
  );
}
