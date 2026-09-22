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
  type Rendition,
} from '@kp/api';
import { clock, untaggedSeconds, coverageOpen, type TimelineSegment } from '@kp/core';
import { Button } from '@kp/ui/button';
import { Link, useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCheck, ChevronLeft, Pause, Play, Plus, Repeat, ScanLine } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { SegmentEditor } from '~/components/SegmentEditor';
import { Timeline } from '~/components/Timeline';
import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';
import { SKIP_COARSE, SKIP_FINE, SPEEDS, useTagPlayer } from '~/lib/use-tag-player';

/**
 * Should this keystroke belong to the page or to what has focus?
 *
 * Fields you type into keep their keys — without this the space branch's
 * preventDefault meant a space never reached the segment name, and every shabad
 * name is more than one word. The timeline's seek surface is also an <input>,
 * but type=range, and clicking the timeline focuses it — bailing on every input
 * meant one seek killed every shortcut until you clicked somewhere else. Range
 * is the transport's own control, and the handler preventDefaults the arrows so
 * its native 1% steps never fight the 10s skips.
 */
function ownsTheKeys(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  if (el.tagName === 'TEXTAREA' || el.isContentEditable || el.tagName === 'SELECT') return true;
  if (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'range') return true;
  // Widgets that answer to the same keys themselves — driving the transport
  // from inside a dropdown or a dialog means both things happen at once.
  return (
    typeof el.closest === 'function' &&
    el.closest('[role="combobox"],[role="listbox"],[role="menu"],[role="dialog"]') !== null
  );
}

export function TagRoute() {
  const { id } = useParams({ from: '/tag/$id' });
  const { session, can } = useSession();

  const recording = useRecording(supabase, id);
  const renditions = useRenditions(supabase, id);
  const scan = useScanRequest(supabase, id);
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const player = useTagPlayer(recording.data?.url);
  const { position, duration } = player;

  /**
   * `null` means no editor open; a Rendition means revising that one; `'new'`
   * means creating. Three states rather than two booleans, because "editing
   * nothing" and "editing a new thing" are genuinely different and a pair of
   * flags lets them both be true.
   */
  const [editing, setEditing] = useState<Rendition | 'new' | null>(null);

  /*
   * The cut being marked lives here, not in the editor.
   *
   * The timeline has to draw it — a boundary marked by ear means nothing until
   * you can see where it landed among the segments already saved — and the
   * editor and the timeline both have to be able to move it. One owner above
   * both is the only arrangement where dragging a handle and pressing +1s are
   * the same edit.
   */
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);

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

  /*
   * Opening and closing the editor set the boundaries, rather than an effect
   * watching `editing` and setting them afterwards.
   *
   * The effect version ran a render late, so the timeline drew the previous
   * segment's band for a frame every time a row was clicked. Every path that
   * changes the target goes through one of these three, which is what made the
   * effect removable: `markStart`/`markEnd` deliberately do not, because they
   * set one boundary themselves and must leave the other alone.
   */
  const editRendition = useCallback((row: Rendition) => {
    setStart(Number(row.start_sec));
    setEnd(Number(row.end_sec));
    setEditing(row);
  }, []);

  const closeEditor = useCallback(() => {
    setStart(null);
    setEnd(null);
    setEditing(null);
  }, []);

  const openNew = useCallback(() => {
    // Both at the playhead: the start is where you are, and the end is marked
    // when you get there. An end that defaulted to the duration would draw a
    // band across the rest of the recording the moment the editor opened.
    setStart(position);
    setEnd(position);
    setEditing('new');
  }, [position]);

  const markStart = useCallback(() => {
    setStart(position);
    setEditing((e) => e ?? 'new');
  }, [position]);

  const markEnd = useCallback(() => {
    setEnd(position);
    setEditing((e) => e ?? 'new');
  }, [position]);

  /*
   * On the window, not on a wrapper: the page's own section has to be clicked
   * before it can receive a keystroke, so half the shortcuts did nothing until
   * you happened to click the background. Hands stay on the keyboard — a tagger
   * who reaches for the mouse between every cut tags a fraction as much.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (ownsTheKeys(e.target)) return;
      const fine = e.shiftKey;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          player.toggle();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          player.skip(fine ? -SKIP_FINE : -SKIP_COARSE);
          break;
        case 'ArrowRight':
          e.preventDefault();
          player.skip(fine ? SKIP_FINE : SKIP_COARSE);
          break;
        case 'ArrowUp':
          e.preventDefault();
          player.cycleSpeed(1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          player.cycleSpeed(-1);
          break;
        // Brackets, as every editor that trims media uses them.
        case '[':
          e.preventDefault();
          markStart();
          break;
        case ']':
          e.preventDefault();
          markEnd();
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player, markStart, markEnd]);

  const untagged = duration ? untaggedSeconds(segments, duration) : null;

  return (
    <section className="flex flex-col gap-5">
      <Link
        to="/"
        search={(prev) => prev}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Queue
      </Link>

      {recording.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      {recording.data ? (
        <>
          <header>
            <h1 className="font-display text-2xl font-semibold">
              {recording.data.title ?? recording.data.raw_filename ?? recording.data.id}
            </h1>
            <p className="text-sm text-muted-foreground">
              {recording.data.artist_dir ?? 'Unknown'}
              {recording.data.date ? ` · ${recording.data.date}` : ''}
              {` · ${recording.data.tree}`}
            </p>
          </header>

          <div className="flex flex-col gap-2.5 rounded-xl border border-border p-3">
            {/* One row on a real screen. On a phone the fixed-width clocks left
                the axis 185px wide — one ruler tick and unreadable segment
                labels — so the timeline claims its own full-width line and the
                clocks share the first. */}
            <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
              <Button
                size="icon-sm"
                onClick={player.toggle}
                title={player.playing ? 'Pause (space)' : 'Play (space)'}
                aria-label={player.playing ? 'Pause' : 'Play'}
                className="mt-0.5 shrink-0 rounded-full"
              >
                {player.playing ? (
                  <Pause className="fill-current" />
                ) : (
                  <Play className="fill-current" />
                )}
              </Button>
              <span className="mt-2.5 w-14 shrink-0 text-xs tabular-nums text-muted-foreground">
                {clock(position)}
              </span>

              <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
                <Timeline
                  segments={segments}
                  duration={duration}
                  position={position}
                  start={start}
                  end={end}
                  editingId={editing && editing !== 'new' ? editing.id : null}
                  onSeek={player.seek}
                  onChangeStart={setStart}
                  onChangeEnd={setEnd}
                  onAudition={player.auditionBoundary}
                />
              </div>

              <span className="mt-2.5 ml-auto w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:ml-0">
                {clock(duration)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Speed is a setting you pick once and forget, not a control you
                  work: six always-visible buttons spent a third of the transport
                  saying so. The arrow keys still cycle it, which is how it
                  actually gets changed mid-listen. */}
              <select
                value={player.speed}
                onChange={(e) => player.setSpeed(Number(e.target.value))}
                aria-label="Playback speed"
                title="Playback speed (↑ ↓)"
                className="h-7 rounded-md border border-border bg-background px-2 text-[11px] text-foreground"
              >
                {SPEEDS.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}×
                  </option>
                ))}
              </select>

              {/* Looping is a mode with no other way out, so its exit is always
                  visible while it is on rather than living in a menu. */}
              {player.loop ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={player.stopLoop}
                  title="Stop looping"
                  className="h-7 text-xs text-amber-400"
                >
                  <Repeat className="size-3.5" />
                  Looping
                </Button>
              ) : null}

              <Button variant="outline" size="sm" onClick={markStart} className="h-7 text-xs">
                Mark start
              </Button>
              <Button variant="outline" size="sm" onClick={markEnd} className="h-7 text-xs">
                Mark end
              </Button>

              {/* The skip buttons that used to sit here did exactly what the
                  arrow keys do, so the keys are the control now and this is no
                  longer a footnote: it is the only place that says how to move
                  through a recording. */}
              <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">
                <span className="text-foreground/70">space</span> play ·{' '}
                <span className="text-foreground/70">← →</span> 10s ·{' '}
                <span className="text-foreground/70">shift+← →</span> 0.1s ·{' '}
                <span className="text-foreground/70">↑ ↓</span> speed ·{' '}
                <span className="text-foreground/70">[ ]</span> mark start/end
              </span>
            </div>
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
                    className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-accent/50"
                  >
                    <button
                      type="button"
                      onClick={() => player.seek(Number(r.start_sec))}
                      className="min-w-0 flex-1 truncate text-left text-sm"
                    >
                      {r.name}
                    </button>
                    <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs text-muted-foreground">
                      {r.status}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {clock(Number(r.start_sec))}–{clock(Number(r.end_sec))}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => editRendition(r)}>
                      Edit
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {editing ? (
            <SegmentEditor
              // Remounts when the target changes, which is how the form reloads
              // itself — see the comment on its state block. Safe because the
              // editor unmounts entirely when `editing` is null.
              key={editing === 'new' ? 'new' : editing.id}
              trackId={id}
              userId={session?.user.id ?? ''}
              position={position}
              segments={segments}
              editing={editing === 'new' ? null : editing}
              start={start ?? 0}
              end={end ?? 0}
              onChangeStart={setStart}
              onChangeEnd={setEnd}
              onAudition={player.auditionBoundary}
              can={{
                propose: can['renditions.propose'],
                publish: can['renditions.publish'],
                remove: can['renditions.delete'],
                review: can['renditions.review'],
              }}
              onDone={closeEditor}
              onSeek={player.seek}
            />
          ) : (
            <Button
              variant="outline"
              disabled={!can['renditions.propose']}
              onClick={openNew}
              className="self-start"
            >
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
                }
              >
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
                  }
                >
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
