/**
 * The tagging workbench.
 *
 * Its own audio element rather than the player store: the workbench scrubs a
 * whole 70-minute recording looking for boundaries, which is the opposite of
 * what the store is for — the store plays *segments* and stops at their ends,
 * and that is exactly the behaviour a tagger needs turned off.
 */
import {
  canPublishRendition,
  nextUntaggedPuratan,
  requestScan,
  rescan,
  setRenditionStatus,
  setTaggedDone,
  usePuratanLeft,
  useRecording,
  useRenditions,
  useScanRequest,
  type Rendition,
  type ScanFinding,
} from '@kp/api';
import { clock, coverageOpen, untaggedGaps, untaggedSeconds, type TimelineSegment } from '@kp/core';
import { Button } from '@kp/ui/button';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  CheckCheck,
  ChevronLeft,
  Pause,
  Pencil,
  Play,
  Repeat,
  ScanLine,
  Send,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { LoadStatus } from '~/components/LoadStatus';
import { SegmentEditor, type PuratanLoop } from '~/components/SegmentEditor';
import { Timeline } from '~/components/Timeline';
import { useSession } from '~/lib/session';
import { skip, unskip, useSkipped } from '~/lib/skips';
import { supabase } from '~/lib/supabase';
import { recordingHeading, useTitleMatches } from '~/lib/title-match';
import { MIN_LENGTH, SKIP_COARSE, SKIP_FINE, SPEEDS, useTagPlayer } from '~/lib/use-tag-player';

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

/**
 * One workbench per recording.
 *
 * Keyed on the id because the router reuses this component when one tag page
 * links to another, which Publish & next and Skip do on every press. Reused,
 * the boundaries, the open row and the audio element would all carry over into
 * the next recording.
 */
export function TagRoute() {
  const { id } = useParams({ from: '/tag/$id' });
  return <Workbench key={id} id={id} />;
}

function Workbench({ id }: { id: string }) {
  const { session, can, permissionsLoading } = useSession();
  const userId = session?.user.id ?? '';
  const search = useSearch({ from: '/tag/$id' });
  const navigate = useNavigate();

  const recording = useRecording(supabase, id);
  const renditions = useRenditions(supabase, id);
  const scan = useScanRequest(supabase, id);
  const queryClient = useQueryClient();

  /*
   * A scan finishing is when its drafts exist: show them without a reload.
   * On the change only — a scan already done when the page opened had its
   * drafts in the first renditions fetch.
   */
  const scanQueued = scan.data != null && !scan.data.done_at;
  const scanDoneAt = scan.data?.done_at ?? null;
  const sawQueued = useRef(false);
  useEffect(() => {
    if (scanQueued) {
      sawQueued.current = true;
    } else if (sawQueued.current && scanDoneAt) {
      sawQueued.current = false;
      void queryClient.invalidateQueries({ queryKey: ['renditions', id] });
    }
  }, [scanQueued, scanDoneAt, queryClient, id]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const player = useTagPlayer(recording.data?.url);
  const { position, duration } = player;

  const playFrom = useCallback(
    (at: number) => {
      player.seek(at);
      if (!player.playing) player.toggle();
    },
    [player]
  );

  /** The row being revised, or null while the form is adding a new one. */
  const [editing, setEditing] = useState<Rendition | null>(null);

  /*
   * The cut being marked lives here, not in the editor.
   *
   * The timeline has to draw it and the editor has to nudge it, and one owner
   * above both is the only arrangement where dragging a handle and pressing
   * +1s are the same edit. Null until marked.
   */
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);

  /**
   * Bumped whenever the form should start over — after a save, or when a gap
   * or pointer loads new boundaries — so the editor's fields reset with it.
   */
  const [formKey, setFormKey] = useState(0);
  const [seedName, setSeedName] = useState<string | undefined>(undefined);
  const formRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => renditions.data ?? [], [renditions.data]);
  const segments: TimelineSegment[] = useMemo(
    () =>
      rows.map((r) => ({
        id: r.id,
        start: Number(r.start_sec),
        end: Number(r.end_sec),
        name: r.name,
        published: r.status === 'published',
      })),
    [rows]
  );

  /* ── Whole-file mode ────────────────────────────────────────────────────
   *
   * Built for puratan, where one file IS one shabad. The boundaries are 0 to
   * the file's own length and the filename names the shabad, so the tagger's
   * job collapses to checking the match and publishing. Nothing saves itself:
   * a wrong match would put a mislabeled shabad straight into the player.
   */
  const isPuratan = recording.data?.tree === 'puratan';
  /**
   * The only state where whole-file bounds are an offer rather than a
   * duplicate. On data, not isSuccess: a background refetch that fails keeps
   * the rows it had, and must not collapse the mode mid-task.
   */
  const untouched = renditions.data !== undefined && rows.length === 0;
  /** The tagger's own choice; null follows the default, which is on for puratan. */
  const [wholeFileChoice, setWholeFileChoice] = useState<boolean | null>(null);
  const wholeFileOffered = untouched && !editing;
  const wholeFile = wholeFileOffered && (wholeFileChoice ?? isPuratan);

  // Derived, not written into state, so a browser revising its first VBR
  // length estimate carries through until the tagger touches a boundary.
  const wholeEnd = duration ? Math.round(duration * 100) / 100 : null;
  const shownStart = wholeFile ? 0 : start;
  const shownEnd = wholeFile ? wholeEnd : end;

  /** Touching a boundary means the whole-file premise was wrong: keep 0 → end as the starting point. */
  const leaveWholeFile = useCallback(() => {
    if (!wholeFile) return;
    setWholeFileChoice(false);
    setStart(0);
    setEnd(wholeEnd);
  }, [wholeFile, wholeEnd]);

  const heading = recording.data ? recordingHeading(recording.data) : '';
  const titleMatches = useTitleMatches(heading, wholeFile);

  /* ── The puratan loop ─────────────────────────────────────────────────── */

  const skipped = useSkipped();
  const exclude = useMemo(() => [...skipped, id], [skipped, id]);
  const loopOn = isPuratan && wholeFile && !editing;
  const puratanLeft = usePuratanLeft(supabase, exclude, loopOn);

  const openNext = useCallback(async () => {
    const next = await nextUntaggedPuratan(supabase, exclude, recording.data?.artist_dir);
    if (!next) return false;
    void navigate({
      to: '/tag/$id',
      params: { id: next },
      search: ({ rendition: _, ...keep }) => keep,
    });
    return true;
  }, [exclude, navigate, recording.data?.artist_dir]);

  const loop: PuratanLoop | null = loopOn
    ? {
        left: puratanLeft.data ?? null,
        next: async () => {
          /*
           * Coverage can never close a slot-less recording on its own, so the
           * loop says it is done. A refused mark would strand the recording —
           * off this queue with a rendition, and unmeasurable — so it stops
           * here and says so rather than moving on.
           */
          if (can['tracks.mark_done'] && !recording.data?.tagged_done_at) {
            try {
              await setTaggedDone(supabase, id, true);
            } catch (e) {
              throw new Error(
                `Saved, but couldn't mark the recording done: ${e instanceof Error ? e.message : e}`,
                { cause: e }
              );
            }
          }
          if (!(await openNext())) {
            throw new Error(
              skipped.length
                ? 'Saved. Nothing left except the ones you skipped — they’re still in the queue.'
                : 'Saved. That was the last one — no untagged puratan recordings left.'
            );
          }
        },
        skip: async () => {
          skip(id);
          let moved = false;
          try {
            moved = await openNext();
          } finally {
            // A skip must not outlive a navigation that never happened.
            if (!moved) unskip(id);
          }
          if (!moved) {
            throw new Error('Nothing else to open — the skipped ones are still in the queue.');
          }
        },
      }
    : null;

  /* ── Opening and closing rows ─────────────────────────────────────────── */

  const focusForm = useCallback(() => {
    // After the reflow the new boundaries cause, or the smooth scroll is cancelled by it.
    requestAnimationFrame(() =>
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    );
  }, []);

  /**
   * Who may revise which row, mirroring the UPDATE policy: review edits
   * anything, everyone else only their own unpublished work. An update RLS
   * filters out comes back with no error, so offering it to everyone would
   * mean a form that clears itself while the row sits unchanged.
   */
  const canEdit = useCallback(
    (r: Rendition) =>
      can['renditions.review'] || (r.created_by === userId && r.status !== 'published'),
    [can, userId]
  );

  const editRendition = useCallback(
    (row: Rendition) => {
      setStart(Number(row.start_sec));
      setEnd(Number(row.end_sec));
      setEditing(row);
      setSeedName(undefined);
      focusForm();
    },
    [focusForm]
  );

  /*
   * Arriving from the review queue opens that row. Set during render, the way
   * React recommends for state derived from a prop arriving, so the form never
   * paints a frame empty first.
   */
  const [deepLinked, setDeepLinked] = useState(false);
  // Waits for the permissions and the session too: decided on NONE, `canEdit`
  // is false and the row would silently never open.
  if (!deepLinked && search.rendition && renditions.isSuccess && userId && !permissionsLoading) {
    setDeepLinked(true);
    const wanted = rows.find((r) => r.id === search.rendition);
    if (wanted && canEdit(wanted)) {
      setStart(Number(wanted.start_sec));
      setEnd(Number(wanted.end_sec));
      setEditing(wanted);
    }
  }

  const newForm = useCallback((from: number | null, to: number | null, name?: string) => {
    setEditing(null);
    setStart(from);
    setEnd(to);
    setSeedName(name);
    setFormKey((k) => k + 1);
  }, []);

  const closeEditor = useCallback(() => newForm(null, null), [newForm]);

  /**
   * After a save. A revision closes; a new segment rolls the start forward to
   * where it ended, because the next shabad begins there and consecutive
   * segments should be one mark each.
   */
  const onSaved = useCallback(() => {
    if (editing || wholeFile) newForm(null, null);
    else newForm(end, null);
  }, [editing, wholeFile, end, newForm]);

  /** An untagged stretch: the neighbouring cuts are the best guess at where it runs. */
  const tagGap = useCallback(
    (g: { start: number; end: number }) => {
      newForm(Math.round(g.start * 100) / 100, Math.round(g.end * 100) / 100);
      player.seek(g.start);
      focusForm();
    },
    [newForm, player, focusForm]
  );

  /**
   * A scan pointer: boundaries and a starting name, and deliberately not the
   * shabad link. The pointer is below the scanner's confidence gate by
   * definition, so the tagger who listens picks the shabad themselves.
   */
  const tagPointer = useCallback(
    (f: ScanFinding) => {
      newForm(f.start, f.end, f.name);
      player.seek(Math.max(0, f.start - 5));
      focusForm();
    },
    [newForm, player, focusForm]
  );

  /*
   * Marking a boundary never crosses the other one. A start marked past the
   * end clears the end — the playhead has usually run on by the time you hear
   * the next shabad begin — and an end marked before the start clears the
   * start. Both leave "mark the other one" as the next step rather than an
   * error about a range nobody asked for.
   */
  const markStart = useCallback(() => {
    leaveWholeFile();
    setStart(position);
    setEnd((e) => (e != null && e < position + MIN_LENGTH ? null : e));
  }, [position, leaveWholeFile]);

  const markEnd = useCallback(() => {
    leaveWholeFile();
    setEnd(position);
    setStart((s) => (s != null && s > position - MIN_LENGTH ? null : s));
  }, [position, leaveWholeFile]);

  const changeStart = useCallback(
    (v: number) => {
      leaveWholeFile();
      setStart(v);
    },
    [leaveWholeFile]
  );
  const changeEnd = useCallback(
    (v: number) => {
      leaveWholeFile();
      setEnd(v);
    },
    [leaveWholeFile]
  );

  // Nothing to drive until the recording is here — and a failed load's Try
  // again is a plain button, whose Space this handler would otherwise swallow.
  const hasRecording = Boolean(recording.data);

  /*
   * On the window, not on a wrapper: the page's own section has to be clicked
   * before it can receive a keystroke, so half the shortcuts did nothing until
   * you happened to click the background. Hands stay on the keyboard — a tagger
   * who reaches for the mouse between every cut tags a fraction as much.
   */
  useEffect(() => {
    if (!hasRecording) return;
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
  }, [hasRecording, player, markStart, markEnd]);

  /* ── What is done and what is left ────────────────────────────────────── */

  const untagged = duration ? untaggedSeconds(segments, duration) : null;
  const publishedCount = segments.filter((s) => s.published).length;

  /** Segments and the gaps between them on one axis, so the list reads as the recording does. */
  const listRows = useMemo(() => {
    const gaps = duration ? untaggedGaps(segments, duration) : [];
    return [
      ...rows.map((r) => ({ kind: 'segment' as const, at: Number(r.start_sec), r })),
      ...gaps.map((g) => ({ kind: 'gap' as const, at: g.start, g })),
    ].sort((a, b) => a.at - b.at);
  }, [rows, segments, duration]);

  const findings = scan.data?.findings ?? [];
  /** A pointer whose middle already sits inside tagged time is almost certainly done. */
  const covered = (f: ScanFinding) => {
    const mid = (f.start + f.end) / 2;
    return segments.some((s) => mid >= s.start && mid <= s.end);
  };

  function refreshRows() {
    void queryClient.invalidateQueries({ queryKey: ['renditions', id] });
    void queryClient.invalidateQueries({ queryKey: ['recordings'] });
    void queryClient.invalidateQueries({ queryKey: ['pending'] });
  }

  /** Publishing is reversible: only `published` is visible, so pulling one back loses nothing. */
  async function setPublished(r: Rendition, published: boolean) {
    setRowError(({ [r.id]: _, ...rest }) => rest);
    try {
      await setRenditionStatus(supabase, r.id, published ? 'published' : 'draft');
    } catch (e) {
      setRowError((m) => ({ ...m, [r.id]: e instanceof Error ? e.message : 'Failed' }));
    }
    refreshRows();
  }

  const perms = { review: can['renditions.review'], publish: can['renditions.publish'] };

  return (
    <section className="flex flex-col gap-5">
      <Link
        to="/"
        search={({ rendition: _, ...keep }) => keep}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Queue
      </Link>

      {/* Said, not left blank: a failed load used to render the back link and
          nothing else, which reads as a broken page rather than a retryable one.
          The segments count as much as the recording — drawn without them, the
          workbench shows a recording with nothing tagged, offers Suggest shabads
          over a finished scan, and lets a tagger mark and save again segments
          that exist. Try again takes the scan request too. */}
      <LoadStatus
        what="this recording"
        queries={recording.data === null ? [] : [recording, renditions]}
        retry={() => {
          void recording.refetch();
          void renditions.refetch();
          void scan.refetch();
        }}
      />
      {recording.data === null ? (
        <p className="text-sm text-muted-foreground">
          This recording is not in the tagging queue — no recording has this id, or it is one the
          queue leaves out: day-wise files, unplayable formats and recordings gone from sgpc.net.
        </p>
      ) : null}

      {recording.data && renditions.data !== undefined ? (
        <>
          <header className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <div className="min-w-64 flex-1">
              <h1 className="font-display text-2xl font-semibold">{heading}</h1>
              <p className="text-sm text-muted-foreground">
                {recording.data.artist_dir ?? 'Unknown'}
                {recording.data.date ? ` · ${recording.data.date}` : ''}
                {` · ${recording.data.tree}`}
              </p>
            </div>
            {/* The scoreboard: "is this one finished?" without counting rows. */}
            <dl className="flex shrink-0 gap-5 text-right">
              <div>
                <dt className="text-[11px] text-muted-foreground">Shabads</dt>
                <dd className="text-sm tabular-nums">
                  <span
                    className={
                      publishedCount > 0 && publishedCount === rows.length ? 'text-emerald-400' : ''
                    }
                  >
                    {publishedCount}
                  </span>
                  <span className="text-muted-foreground/60">/{rows.length} published</span>
                </dd>
              </div>
              {duration ? (
                <div>
                  <dt className="text-[11px] text-muted-foreground">Tagged</dt>
                  <dd className="text-sm tabular-nums">
                    {Math.round(((duration - (untagged ?? 0)) / duration) * 100)}%
                    {recording.data.tagged_done_at ? (
                      <span className="text-emerald-400"> · done</span>
                    ) : null}
                  </dd>
                </div>
              ) : null}
            </dl>
          </header>

          {/* The transport follows you down the page: every job below it needs
              playback and the axis, and letting it scroll away meant scrolling
              back up to press play. */}
          <div className="sticky top-0 z-20 -mx-1 flex flex-col gap-2.5 rounded-xl border border-border bg-background/95 p-3 backdrop-blur">
            {/* One row on a real screen. On a phone the timeline claims its own
                full-width line and the clocks share the first. */}
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
                  start={shownStart}
                  end={shownEnd}
                  editingId={editing?.id ?? null}
                  onSeek={player.seek}
                  onChangeStart={changeStart}
                  onChangeEnd={changeEnd}
                  onAudition={player.auditionBoundary}
                />
              </div>

              <span className="mt-2.5 ml-auto w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:ml-0">
                {clock(duration)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Speed is a setting you pick once and forget; the arrow keys
                  still cycle it mid-listen. */}
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
                  visible while it is on. */}
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

              <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">
                <span className="text-foreground/70">space</span> play ·{' '}
                <span className="text-foreground/70">← →</span> 10s ·{' '}
                <span className="text-foreground/70">shift+← →</span> 0.1s ·{' '}
                <span className="text-foreground/70">↑ ↓</span> speed ·{' '}
                <span className="text-foreground/70">[ ]</span> mark start/end
              </span>
            </div>
          </div>

          {can['renditions.propose'] ? (
            <div ref={formRef}>
              <SegmentEditor
                // Remounts when the target changes, which is how the form
                // reloads itself — see the comment on its state block.
                key={editing ? editing.id : `new-${formKey}`}
                trackId={id}
                userId={userId}
                segments={segments}
                editing={editing}
                start={shownStart}
                end={shownEnd}
                onMarkStart={markStart}
                onMarkEnd={markEnd}
                onChangeStart={changeStart}
                onChangeEnd={changeEnd}
                onAudition={player.auditionBoundary}
                onSeek={player.seek}
                wholeFile={wholeFileOffered ? wholeFile : null}
                onWholeFile={(on) => {
                  setWholeFileChoice(on);
                  if (!on) {
                    setStart(0);
                    setEnd(wholeEnd);
                  }
                }}
                duration={duration}
                // Offered for as long as nothing is tagged, not only while the
                // whole-file mode is on: trimming an applause tail off a
                // puratan file is still confirming the same match, and gating
                // on the mode unlinked the shabad and blanked the name the
                // moment a boundary moved. Cached, so leaving the mode does
                // not drop what was fetched.
                titleMatches={wholeFileOffered ? (titleMatches.data ?? []) : []}
                titleMatching={wholeFile && titleMatches.isFetching}
                seedName={seedName}
                loop={loop}
                can={{
                  propose: can['renditions.propose'],
                  publish: can['renditions.publish'],
                  remove: can['renditions.delete'],
                  review: can['renditions.review'],
                }}
                onSaved={onSaved}
                onCancel={closeEditor}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your account cannot create segments yet.
            </p>
          )}

          {findings.length ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h2 className="text-sm font-medium">
                  <Sparkles className="mr-1 inline size-3.5 text-muted-foreground" />
                  Scan pointers ({findings.length})
                </h2>
                {/* Below the scanner's confidence gates: jump there, listen,
                    and tag by ear if it is real. */}
                <p className="text-xs text-muted-foreground">
                  Heard but not confident. Nothing is saved until you save it.
                </p>
              </div>
              <ul className="flex flex-col gap-1">
                {findings.map((f) => (
                  <li
                    key={`${f.shabad_id}-${f.start}`}
                    className={
                      'flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2' +
                      (covered(f) ? ' opacity-55' : '')
                    }
                  >
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Listen from ${clock(f.start)}`}
                      onClick={() => playFrom(Math.max(0, f.start - 5))}
                    >
                      <Play />
                    </Button>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{f.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {Math.round(f.confidence * 100)}% match
                        {covered(f) ? ' · already tagged here' : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {clock(f.start)}–{clock(f.end)}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => tagPointer(f)}>
                      Tag this
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">Segments ({rows.length})</h2>
              {untagged != null ? (
                <span className="text-xs text-muted-foreground">
                  {clock(untagged)} untagged
                  {/* The same predicate the shelves and the row badge use, so
                      the three cannot drift into disagreeing about "done". */}
                  {coverageOpen(untagged) ? '' : ' · within slack'}
                </span>
              ) : null}
            </div>

            {rows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                {wholeFile
                  ? 'This recording is one shabad end to end — confirm the match above and publish. Nothing needs marking.'
                  : 'Nothing tagged yet. Play through, then mark where a shabad starts and ends — both ends can be nudged afterwards, so a rough pass is worth more than a perfect one.'}
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {listRows.map((item) =>
                  item.kind === 'gap' ? (
                    // The gaps used to be invisible: you could only find them
                    // by reading timestamps down the list and subtracting.
                    <li
                      key={`gap-${item.g.start}`}
                      className="flex flex-wrap items-center gap-x-2 py-1 pl-12 text-xs text-muted-foreground/80"
                    >
                      <span className="tabular-nums">
                        {clock(item.g.end - item.g.start)} untagged · {clock(item.g.start)}–
                        {clock(item.g.end)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => playFrom(item.g.start)}
                      >
                        <Play className="size-3" /> Listen
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => tagGap(item.g)}
                      >
                        Tag this gap
                      </Button>
                    </li>
                  ) : (
                    <SegmentRow
                      key={item.r.id}
                      r={item.r}
                      open={editing?.id === item.r.id}
                      error={rowError[item.r.id]}
                      canEdit={canEdit(item.r)}
                      canReview={perms.review}
                      canPublish={canPublishRendition(item.r, perms, userId)}
                      onPlay={() => playFrom(Number(item.r.start_sec))}
                      onAudition={player.auditionBoundary}
                      onEdit={() => editRendition(item.r)}
                      onPublish={(on) => void setPublished(item.r, on)}
                    />
                  )
                )}
              </ul>
            )}
          </div>

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
                scan.data.done_at ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void rescan(supabase, id, userId)
                        .then(() =>
                          queryClient.invalidateQueries({ queryKey: ['scan-request', id] })
                        )
                        .catch((e) => setActionError(e instanceof Error ? e.message : 'Failed'))
                    }
                  >
                    <ScanLine />
                    Scan again
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Queued for scanning — its drafts appear here when it finishes
                  </span>
                )
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void requestScan(supabase, id, userId)
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

/**
 * One saved segment. The timestamps are controls: each loops a few seconds
 * either side of that cut, which puts the check on the number it affects
 * rather than behind the Edit button.
 */
function SegmentRow({
  r,
  open,
  error,
  canEdit,
  canReview,
  canPublish,
  onPlay,
  onAudition,
  onEdit,
  onPublish,
}: {
  r: Rendition;
  open: boolean;
  error?: string;
  canEdit: boolean;
  canReview: boolean;
  canPublish: boolean;
  onPlay: () => void;
  onAudition: (at: number) => void;
  onEdit: () => void;
  onPublish: (on: boolean) => void;
}) {
  const published = r.status === 'published';
  const startSec = Number(r.start_sec);
  const endSec = Number(r.end_sec);
  return (
    <li
      className={
        open ? 'rounded-lg bg-accent ring-1 ring-primary/40' : 'rounded-lg hover:bg-accent/50'
      }
    >
      <div className="flex items-center gap-2 px-2 py-2">
        <Button variant="ghost" size="icon-sm" aria-label={`Play ${r.name}`} onClick={onPlay}>
          <Play />
        </Button>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{r.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {r.shabad_id ? 'shabad linked' : 'no shabad linked'}
            {r.raag ? ` · ${r.raag}` : ''}
          </span>
          {r.source === 'scan' && (!published || r.line_timings?.length) ? (
            // Its own line, wrapping rather than truncated: on the line above,
            // the shadow verdict came last and was the part that got cut off.
            <span className="block text-xs text-muted-foreground">
              {[
                // Until someone publishes it: the edges are a machine's guess
                // (~5 s off at the median on prod), worth checking by ear.
                !published && 'from the scan, check the edges',
                r.line_timings?.length && 'lyrics timed',
                // What it would have done had auto-publish been on — shown so
                // a reviewer can hold the verdict against their own ear.
                r.scan_verdict?.auto && !published && 'would auto-publish',
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-xs tabular-nums">
          <button
            type="button"
            title="Play across the start cut"
            onClick={() => onAudition(startSec)}
            className="rounded px-1 py-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
          >
            {clock(startSec)}
          </button>
          <span className="text-muted-foreground/40">–</span>
          <button
            type="button"
            title="Play across the end cut"
            onClick={() => onAudition(endSec)}
            className="rounded px-1 py-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
          >
            {clock(endSec)}
          </button>
        </span>

        <span
          className={
            published
              ? 'shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400'
              : 'shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs text-muted-foreground'
          }
        >
          {r.status}
        </span>

        {/* Publishing without reopening the row. A reviewer can go both ways; a
            publisher without review can only promote their own draft, once —
            the policy stops matching the row as soon as it is published. */}
        {canPublish ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onPublish(true)}
          >
            <Send className="size-3" /> Publish
          </Button>
        ) : published && canReview ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => onPublish(false)}
          >
            Unpublish
          </Button>
        ) : null}

        {canEdit ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${r.name}`}
            title="Edit name, shabad or timing"
            className={open ? 'text-primary' : 'text-muted-foreground'}
            onClick={onEdit}
          >
            <Pencil />
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="px-2 pb-2 pl-12 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  );
}
