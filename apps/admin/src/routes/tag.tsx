/**
 * The tagging workbench.
 *
 * Its own audio element rather than the player store: the workbench scrubs a
 * whole 70-minute recording looking for boundaries, which is the opposite of
 * what the store is for — the store plays *segments* and stops at their ends,
 * and that is exactly the behaviour a tagger needs turned off.
 */
import {
  requestScan,
  setTaggedDone,
  useRecording,
  useRenditions,
  useScanRequest,
  usePermissions,
  useAuth,
  type Rendition,
} from '@kp/api';
import { untaggedSeconds, coverageOpen, type TimelineSegment } from '@kp/core';
import { Button } from '@kp/ui/button';
import { Link, useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCheck, ChevronLeft, Pause, Play, Plus, ScanLine, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { SegmentEditor } from '~/components/SegmentEditor';
import { Timeline } from '~/components/Timeline';
import { supabase } from '~/lib/supabase';
import { clock } from '~/lib/utils';

/** Arrow-key nudge, and what the skip buttons move by. */
const NUDGE_SECONDS = 15;

export function TagRoute() {
  const { id } = useParams({ from: '/tag/$id' });
  const { session } = useAuth(supabase);
  const { can } = usePermissions(supabase, Boolean(session));

  const recording = useRecording(supabase, id);
  const renditions = useRenditions(supabase, id);
  const scan = useScanRequest(supabase, id);
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const audio = useRef<HTMLAudioElement | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);

  /**
   * `null` means no editor open; a Rendition means revising that one; `'new'`
   * means creating. Three states rather than two booleans, because "editing
   * nothing" and "editing a new thing" are genuinely different and a pair of
   * flags lets them both be true.
   */
  const [editing, setEditing] = useState<Rendition | 'new' | null>(null);

  const url = recording.data?.url;

  useEffect(() => {
    if (!url) return;
    // Created rather than rendered so a re-render cannot restart the file the
    // tagger is halfway through. crossOrigin stays unset — sgpc.net sends no
    // Access-Control-Allow-Origin, and requiring one fails every track.
    const el = new Audio(url);
    el.preload = 'metadata';
    audio.current = el;

    const tick = () => setPosition(el.currentTime);
    const meta = () => setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    el.addEventListener('timeupdate', tick);
    el.addEventListener('loadedmetadata', meta);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);

    return () => {
      el.pause();
      el.removeEventListener('timeupdate', tick);
      el.removeEventListener('loadedmetadata', meta);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      audio.current = null;
    };
  }, [url]);

  const segments: TimelineSegment[] = useMemo(
    () =>
      (renditions.data ?? []).map((r) => ({
        id: r.id,
        start: Number(r.start_sec),
        end: Number(r.end_sec),
        name: r.name,
        published: r.status === 'published',
      })),
    [renditions.data]
  );

  function seek(seconds: number) {
    const el = audio.current;
    if (!el) return;
    el.currentTime = Math.min(Math.max(0, seconds), duration || seconds);
    setPosition(el.currentTime);
  }

  const untagged = duration ? untaggedSeconds(segments, duration) : null;

  return (
    <section
      className="flex flex-col gap-5 outline-none"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') seek(position + NUDGE_SECONDS);
        if (e.key === 'ArrowLeft') seek(position - NUDGE_SECONDS);
        if (e.key === ' ') {
          e.preventDefault();
          playing ? audio.current?.pause() : void audio.current?.play();
        }
      }}>
      <Link
        to="/"
        search={(prev) => prev}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" />
        Queue
      </Link>

      {recording.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      {recording.data ? (
        <>
          <header>
            <h1 className="text-xl font-semibold">
              {recording.data.title ?? recording.data.raw_filename ?? recording.data.id}
            </h1>
            <p className="text-sm text-muted-foreground">
              {recording.data.artist_dir ?? 'Unknown'}
              {recording.data.date ? ` · ${recording.data.date}` : ''}
              {` · ${recording.data.tree}`}
            </p>
          </header>

          <Timeline
            segments={segments}
            duration={duration}
            position={position}
            onSeek={seek}
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={`Back ${NUDGE_SECONDS} seconds`}
              onClick={() => seek(position - NUDGE_SECONDS)}
              className="rounded-full p-2 text-muted-foreground hover:text-foreground">
              <SkipBack className="size-4" />
            </button>
            <button
              type="button"
              aria-label={playing ? 'Pause' : 'Play'}
              onClick={() => (playing ? audio.current?.pause() : void audio.current?.play())}
              className="rounded-full bg-primary p-2.5 text-primary-foreground hover:opacity-90">
              {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
            </button>
            <button
              type="button"
              aria-label={`Forward ${NUDGE_SECONDS} seconds`}
              onClick={() => seek(position + NUDGE_SECONDS)}
              className="rounded-full p-2 text-muted-foreground hover:text-foreground">
              <SkipForward className="size-4" />
            </button>

            <span className="ml-2 text-xs tabular-nums text-muted-foreground">
              {clock(position)} / {clock(duration)}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">Segments</h2>
              {untagged != null ? (
                <span className="text-xs text-muted-foreground">
                  {clock(untagged)} untagged
                  {/* The same predicate the shelves and the row badge use, so
                      the three cannot drift into disagreeing about "done". */}
                  {coverageOpen(untagged) ? '' : ' · within slack'}
                </span>
              ) : null}
            </div>

            {segments.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Nothing tagged yet. Play through, then mark where a shabad starts and ends.
              </p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {(renditions.data ?? []).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-accent/50">
                    <button
                      type="button"
                      onClick={() => seek(Number(r.start_sec))}
                      className="min-w-0 flex-1 truncate text-left text-sm">
                      {r.name}
                    </button>
                    <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs text-muted-foreground">
                      {r.status}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {clock(Number(r.start_sec))}–{clock(Number(r.end_sec))}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>
                      Edit
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {editing ? (
            <SegmentEditor
              trackId={id}
              userId={session?.user.id ?? ''}
              position={position}
              segments={segments}
              editing={editing === 'new' ? null : editing}
              can={{
                propose: can['renditions.propose'],
                publish: can['renditions.publish'],
                remove: can['renditions.delete'],
                review: can['renditions.review'],
              }}
              onDone={() => setEditing(null)}
              onSeek={seek}
            />
          ) : (
            <Button
              variant="outline"
              disabled={!can['renditions.propose']}
              onClick={() => setEditing('new')}
              className="self-start">
              <Plus />
              New segment from {clock(position)}
            </Button>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {can['tracks.mark_done'] ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void setTaggedDone(supabase, id, !recording.data?.tagged_done_at)
                    .then(() => {
                      void queryClient.invalidateQueries({ queryKey: ['recording', id] });
                      void queryClient.invalidateQueries({ queryKey: ['recordings'] });
                    })
                    .catch((e) => setActionError(e instanceof Error ? e.message : 'Failed'))
                }>
                <CheckCheck />
                {recording.data?.tagged_done_at ? 'Unmark fully tagged' : 'Mark fully tagged'}
              </Button>
            ) : null}

            {can['scans.request'] ? (
              scan.data ? (
                <span className="text-xs text-muted-foreground">
                  {scan.data.done_at ? 'Scanned' : 'Queued for scanning'}
                </span>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void requestScan(supabase, id)
                      .then(() => queryClient.invalidateQueries({ queryKey: ['scan-request', id] }))
                      .catch((e) => setActionError(e instanceof Error ? e.message : 'Failed'))
                  }>
                  <ScanLine />
                  Suggest shabads
                </Button>
              )
            ) : null}

            {recording.data?.tagged_done_at ? (
              <span className="text-xs text-muted-foreground">
                {/* Said out loud: the mark hides this recording from In progress
                    for every tagger, not just this one. */}
                Marked fully tagged — hidden from the In progress shelf.
              </span>
            ) : null}
          </div>

          {actionError ? (
            <p role="alert" className="text-sm text-destructive">
              {actionError}
            </p>
          ) : null}

          {/* Shown rather than hidden: a tagger who cannot publish should know
              that is a trust level, not a broken button. */}
          <p className="text-xs text-muted-foreground">
            {can['renditions.publish']
              ? 'You can publish segments on this recording.'
              : 'Your drafts go to review — publishing comes with the trust ladder.'}
          </p>
        </>
      ) : null}
    </section>
  );
}
