/**
 * The tagging workbench.
 *
 * Its own audio element rather than the player store: the workbench scrubs a
 * whole 70-minute recording looking for boundaries, which is the opposite of
 * what the store is for — the store plays *segments* and stops at their ends,
 * and that is exactly the behaviour a tagger needs turned off.
 *
 * Four things, top to bottom: what is left, the player with the strip under
 * its bar, the shabad panel (the lyrics of the strip's segment, or the search
 * for a cut that needs its shabad), and the list. Every segment action is the
 * strip's — the list is a way to get to a segment, not a second set of
 * buttons. The old form remains only for a file that is one shabad end to end.
 */
import {
  acceptScanDrafts,
  canDeleteRendition,
  canPublishRendition,
  deleteRendition,
  publishMissing,
  publishRefusal,
  nextUntaggedPuratan,
  requestScan,
  rescan,
  scanStatus,
  setRenditionStatus,
  setTaggedDone,
  createRendition,
  updateRendition,
  usePuratanLeft,
  useRecording,
  useRenditions,
  useRepeats,
  useScanRequest,
  type Draft,
  type Rendition,
  type ScanFinding,
  type ScanStatus,
} from '@kp/api';
import {
  clock,
  coverageOpen,
  coveredBy,
  gapAt,
  markingWindow,
  overlapping,
  sameShabadApart,
  STRIP_HOLD_SECONDS,
  stripSegment,
  untaggedGaps,
  untaggedSeconds,
  zoomWindow,
  type TimelineSegment,
} from '@kp/core';
import { Button } from '@kp/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@kp/ui/popover';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Copy, Pause, Play, ScanLine } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CoveredChoice, type CoveredDraft } from '~/components/CoveredChoice';
import { Kbd } from '~/components/Kbd';
import { LoadStatus } from '~/components/LoadStatus';
import { SegmentEditor, type PuratanLoop } from '~/components/SegmentEditor';
import { SegmentStrip, type StripMode } from '~/components/SegmentStrip';
import { LyricsPanel, ShabadPicker, type ShabadLink } from '~/components/ShabadPanel';
import { Timeline, type TimelineBand, type TimelinePointer } from '~/components/Timeline';
import { useSession } from '~/lib/session';
import { skip, unskip, useSkipped } from '~/lib/skips';
import { supabase } from '~/lib/supabase';
import { recordingHeading, useTitleMatches } from '~/lib/title-match';
import { cn } from '~/lib/utils';
import { cents, MIN_LENGTH, SKIP_COARSE, SKIP_FINE, useTagPlayer } from '~/lib/use-tag-player';

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
 * The page's keys, for the `?` beside the clock. A copy of what onKey does,
 * so a key added or changed there is changed here too.
 */
const SHORTCUTS: [string, string][] = [
  ['space', 'play / pause'],
  ['← →', 'back / ahead 10 s'],
  ['shift ← →', 'back / ahead 0.1 s'],
  ['↑ ↓', 'speed'],
  ['[', 'start here — or move the start, inside a segment'],
  [']', 'end here — or move the end'],
  [', .', 'previous / next segment'],
  ['o', 'the other segment under the playhead'],
  ['f', 'zoom the bar to the cut / show the whole recording'],
  ['esc', 'undo moved edges, or drop a new cut'],
];

/** How long a deleted draft of your own waits for Undo before it really goes. */
const UNDO_MS = 6000;

/** Least seconds shown either side of a cut when the bar is zoomed (`zoomWindow`). */
const ZOOM_PAD = 30;

/** Where this browser keeps whether the bar is zoomed to the cut. */
const ZOOM_KEY = 'kp.tag.zoomed';

/**
 * A row as a whole draft, with only its edges changed.
 *
 * `updateRendition` writes every field it is given, so the draft carries the
 * row's own raag, taal and titles back — and no `artist`, which is what keeps
 * an update from wiping a value set before, as the form leaves it out too.
 */
function recut(r: Rendition, edges: { start: number; end: number }): Draft {
  return {
    track_id: r.track_id,
    name: r.name,
    start_sec: cents(edges.start),
    end_sec: cents(edges.end),
    shabad_id: r.shabad_id ?? null,
    main_verse_id: r.main_verse_id ?? null,
    name_gurmukhi: r.name_gurmukhi ?? null,
    raag: r.raag ?? null,
    taal: r.taal ?? null,
  };
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
  const { session, can } = useSession();
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
  /** One-click accept, in the header. */
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const scanAgain = () =>
    void rescan(supabase, id, userId)
      .then(() => queryClient.invalidateQueries({ queryKey: ['scan-request', id] }))
      .catch((e) => setActionError(e instanceof Error ? e.message : 'Failed'));

  const player = useTagPlayer(recording.data?.url);
  const { position, duration } = player;

  const playFrom = useCallback(
    (at: number) => {
      player.seek(at);
      if (!player.playing) player.toggle();
    },
    [player]
  );

  /** A segment whose shabad is being changed in the panel under the player. */
  const [renaming, setRenaming] = useState<string | null>(null);
  /** Lyrics open or folded, kept as the strip moves from row to row. */
  const [lyricsOpen, setLyricsOpen] = useState(true);

  /*
   * The cut being marked: started with `[`, ended with `]`, then waiting for
   * its shabad in the panel. The timeline draws it, the strip nudges it, and
   * one owner above both is what makes a drag and a −/+ the same edit. Also
   * the whole-file form's bounds once it is left. Null until marked.
   */
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);

  /**
   * Bumped whenever a cut starts over — after a save, or when a pointer loads
   * new boundaries — so the picker's fields and the whole-file form reset.
   */
  const [formKey, setFormKey] = useState(0);
  const [seedName, setSeedName] = useState<string | undefined>(undefined);
  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * A draft of your own on its way out: hidden at once, deleted when Undo has
   * had its chance. Anything else asks first instead (see removeRow).
   */
  const [doomed, setDoomed] = useState<Rendition | null>(null);
  const spare = useRef<(() => boolean) | null>(null);

  const rows = useMemo(
    () =>
      (renditions.data ?? [])
        .filter((r) => r.id !== doomed?.id)
        .sort((a, b) => Number(a.start_sec) - Number(b.start_sec)),
    [renditions.data, doomed]
  );
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  /*
   * Edges moved in the strip and not saved yet. One row at a time, and the
   * strip stays on it (`pinned` below) until it is saved or undone, so a save
   * can never land on whatever happened to be playing.
   */
  const [moved, setMoved] = useState<{ id: string; start: number; end: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [stripError, setStripError] = useState<string | null>(null);

  const segments: TimelineSegment[] = useMemo(
    () =>
      rows.map((r) => ({
        id: r.id,
        start: moved?.id === r.id ? moved.start : Number(r.start_sec),
        end: moved?.id === r.id ? moved.end : Number(r.end_sec),
        name: r.name,
        published: r.status === 'published',
      })),
    [rows, moved]
  );
  const plainBands: TimelineBand[] = useMemo(
    () =>
      segments.map((s) => ({
        ...s,
        scan: byId.get(s.id)?.source === 'scan' && !s.published,
      })),
    [segments, byId]
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
  const wholeFileOffered = untouched;
  const wholeFile = wholeFileOffered && (wholeFileChoice ?? isPuratan);

  // Derived, not written into state, so a browser revising its first VBR
  // length estimate carries through until the tagger touches a boundary.
  const wholeEnd = duration ? cents(duration) : null;
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
  const loopOn = isPuratan && wholeFile;
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
          let opened = false;
          try {
            opened = await openNext();
          } finally {
            // A skip must not outlive a navigation that never happened.
            if (!opened) unskip(id);
          }
          if (!opened) {
            throw new Error('Nothing else to open — the skipped ones are still in the queue.');
          }
        },
      }
    : null;

  /* ── Opening and closing rows ─────────────────────────────────────────── */

  const focusPanel = useCallback(() => {
    // After the reflow the panel's opening causes, or the smooth scroll is
    // cancelled by it. `nearest`: the player is sticky above it, and centring
    // scrolled the list away for a panel that was already in view.
    requestAnimationFrame(() =>
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    );
  }, []);

  /**
   * Who may revise which row, mirroring the UPDATE policy: review edits
   * anything, everyone else only their own unpublished work. An update RLS
   * filters out comes back with no error, so offering it to everyone would
   * mean edges that spring back while the row sits unchanged.
   */
  const canEdit = useCallback(
    (r: Rendition) =>
      can['renditions.propose'] &&
      (can['renditions.review'] || (r.created_by === userId && r.status !== 'published')),
    [can, userId]
  );

  /** Change a segment's shabad: the picker opens under the player for it. */
  const renameRow = useCallback(
    (row: Rendition) => {
      setRenaming(row.id);
      focusPanel();
    },
    [focusPanel]
  );

  /*
   * Arriving from the review queue puts the playhead on that row, so the strip
   * and the lyrics have it. Read during render, the way React recommends for
   * state derived from a prop arriving; the seek itself waits for the audio
   * (below), which only exists once the recording has loaded.
   */
  const [deepLinked, setDeepLinked] = useState<number | null | false>(false);
  if (deepLinked === false && search.rendition && renditions.isSuccess) {
    const wanted = rows.find((r) => r.id === search.rendition);
    setDeepLinked(wanted ? Number(wanted.start_sec) : null);
  }
  const hasLength = duration > 0;
  const { seek } = player;
  useEffect(() => {
    if (typeof deepLinked === 'number' && hasLength) seek(deepLinked);
  }, [deepLinked, hasLength, seek]);

  const newForm = useCallback((from: number | null, to: number | null, name?: string) => {
    setRenaming(null);
    setStart(from);
    setEnd(to);
    setSeedName(name);
    setFormKey((k) => k + 1);
  }, []);

  /** After the whole-file form saves, it starts over. */
  const onSaved = useCallback(() => {
    // Any change through the editor makes a batch's "4 of 5" out of date.
    setAcceptError(null);
    newForm(null, null);
  }, [newForm]);

  /**
   * A scan pointer: boundaries and a starting name, and deliberately not the
   * shabad link. The pointer is below the scanner's confidence gate by
   * definition, so the tagger who listens picks the shabad themselves.
   */
  const tagPointer = useCallback(
    (f: ScanFinding) => {
      newForm(f.start, f.end, f.name);
      focusPanel();
    },
    [newForm, focusPanel]
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
    setMoved(null);
    setStart(position);
    setEnd((e) => (e != null && e < position + MIN_LENGTH ? null : e));
  }, [position, leaveWholeFile]);

  const markEnd = useCallback(() => {
    leaveWholeFile();
    setEnd(position);
    setStart((s) => (s != null && s > position - MIN_LENGTH ? null : s));
    focusPanel();
  }, [position, leaveWholeFile, focusPanel]);

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

  /* ── What the strip is on ─────────────────────────────────────────────── */

  /** A new cut is being made: started and still playing, or finished and waiting for its shabad. */
  const marking = !wholeFile && start !== null && end === null;
  const naming = !wholeFile && start !== null && end !== null;

  /*
   * The drafts a cut waiting for its shabad lies mostly over, which it replaces
   * unless told not to. Only rows this account may delete, and never a published
   * one: published is settled. The choice is kept with the cut it was made for,
   * so the next cut starts back at Replace.
   */
  const [keptFor, setKeptFor] = useState<number | null>(null);
  const replace = keptFor !== formKey;
  const setReplace = (yes: boolean) => setKeptFor(yes ? null : formKey);
  const namedCut = naming && start !== null && end !== null ? { start, end } : null;
  const coveredDrafts: CoveredDraft[] = namedCut
    ? coveredBy(segments, namedCut).flatMap((s) => {
        const r = byId.get(s.id);
        if (
          !r ||
          r.status === 'published' ||
          !canDeleteRendition(
            r,
            { propose: can['renditions.propose'], delete: can['renditions.delete'] },
            userId
          )
        ) {
          return [];
        }
        const whose = r.source === 'scan' ? 'scan' : r.created_by === userId ? 'yours' : 'other';
        return [{ id: s.id, name: s.name, start: s.start, end: s.end, whose }];
      })
    : [];
  const replacing = replace ? coveredDrafts : [];
  /** Overlapped and staying: said in the picker, as it always was. Kept drafts stay overlapped. */
  const clipped = namedCut
    ? overlapping(segments, namedCut).filter((s) => !replacing.some((c) => c.id === s.id))
    : [];

  /*
   * The segment the strip acts on, held between renders so a played end cut
   * does not let go of it (`stripSegment`). Kept by adjusting state during
   * render, as the deep link is: a ref written here would publish a value from
   * a render React may throw away, and an effect would paint a frame of the
   * wrong row first.
   */
  const [held, setHeld] = useState<string | null>(null);
  /*
   * The segment the tagger chose: a row clicked, an edge played, nudged or
   * set. Setting an end by ear means listening past it, often into the next
   * draft, and a hold measured in seconds let go mid-judgement — so a choice
   * stays until it is undone: Esc, a seek on the bar, a gap, or another row.
   */
  const [chosen, setChosen] = useState<string | null>(null);
  const focusId =
    marking || naming
      ? null
      : stripSegment(segments, position, held, moved?.id ?? renaming ?? chosen);
  if (focusId !== held && !marking && !naming) setHeld(focusId);
  const focus = focusId ? (byId.get(focusId) ?? null) : null;
  const focusSeg = focusId ? segments.find((s) => s.id === focusId) : undefined;

  /*
   * The bar zooms to the strip's segment, a stretch either side so an edge can
   * be pulled outward. Built from the row as saved, not from `segments`,
   * which already carries `moved`: built from that, the window re-fit on every
   * pixel of a drag, so the neighbours slid while the edge under the pointer
   * hardly moved. Whole recording on a gap.
   *
   * Off until asked for, with F (in the `?` list); a button for it sat unseen
   * at the bar's end, so the key is the way in. The strip follows the
   * playhead, so zoomed by default
   * the bar re-framed itself at every shabad and gap of a recording simply
   * playing through. Once on it stays on, and the choice is kept in this
   * browser for next time — a preference, so storage that may be missing.
   */
  const [zoomed, setZoomed] = useState(() => {
    try {
      return localStorage.getItem(ZOOM_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleZoom = () => {
    const next = !zoomed;
    setZoomed(next);
    try {
      localStorage.setItem(ZOOM_KEY, next ? '1' : '0');
    } catch {
      // Private window or blocked storage: the toggle still works for this visit.
    }
  };
  const saved = focus ? { start: Number(focus.start_sec), end: Number(focus.end_sec) } : null;
  /*
   * While marking, the furthest the playhead has got: the window grows from
   * it, so seeking back to re-hear a line does not shrink the bar under the
   * click. Kept with the start it belongs to: `[` pressed again mid-mark is a
   * new cut, and the old reach would have kept its wider window. Adjusted
   * during render, as `held` is.
   */
  const [reach, setReach] = useState<{ from: number | null; at: number }>({ from: null, at: 0 });
  if (marking && start !== null && reach.from !== start) setReach({ from: start, at: position });
  else if (marking && position > reach.at) setReach({ from: reach.from, at: position });
  if (!marking && reach.from !== null) setReach({ from: null, at: 0 });
  /*
   * A finished cut waiting for its shabad is framed when it is finished: its
   * edges are still draggable here, and a window built from them would re-fit
   * under the drag just as a segment's did. A drag cannot leave the window, so
   * an edge outside it means the cut itself changed — `[` after a skip, or a
   * new cut from a suggestion — and that is re-framed.
   */
  const [namingView, setNamingView] = useState<{ start: number; end: number } | null>(null);
  if (
    naming &&
    start !== null &&
    end !== null &&
    (!namingView || start < namingView.start || end > namingView.end)
  )
    setNamingView(zoomWindow({ start, end }, duration, ZOOM_PAD));
  if (!naming && namingView) setNamingView(null);
  const view =
    marking && start !== null
      ? markingWindow(start, reach.at, duration, ZOOM_PAD)
      : naming
        ? namingView
        : saved
          ? zoomWindow(saved, duration, ZOOM_PAD)
          : null;
  const canZoom = view !== null;
  const barWindow = zoomed ? view : null;

  /** Jump to a segment and play it, the strip going with it. */
  const goTo = useCallback(
    (r: Rendition) => {
      setChosen(r.id);
      setHeld(r.id);
      playFrom(Number(r.start_sec));
    },
    [playFrom]
  );

  /** The next or previous segment from where the strip is, by start. */
  const step = useCallback(
    (dir: 1 | -1) => {
      // By place in the list from a segment: two starting within the margin
      // below were stepped over, and one under another could not be reached.
      const at = focusId ? rows.findIndex((r) => r.id === focusId) : -1;
      const next =
        at >= 0
          ? rows[at + dir]
          : dir === 1
            ? rows.find((r) => Number(r.start_sec) > position + 0.5)
            : [...rows].reverse().find((r) => Number(r.start_sec) < position - 0.5);
      if (next) goTo(next);
    },
    [focusId, position, rows, goTo]
  );

  /*
   * The other segments under the playhead. The bar draws one over another and
   * a seek lands on the later start, so a draft with a longer one on top of it
   * had no way onto the strip but its row in the list. Not over unsaved edges,
   * which hold the strip where it is.
   */
  const alsoHere =
    focusSeg && !moved && !renaming && position >= focusSeg.start && position < focusSeg.end
      ? segments.filter((s) => s.id !== focusSeg.id && position >= s.start && position < s.end)
      : [];
  /** The same ragi's tags of this recording's shabads, in other recordings. */
  const shabadIds = useMemo(
    () => [...new Set(rows.flatMap((r) => (r.shabad_id == null ? [] : [r.shabad_id])))].sort(),
    [rows]
  );
  const repeatsElsewhere = useRepeats(supabase, shabadIds, recording.data?.artist_dir, id);
  const shabadSegments = useMemo(
    () => segments.map((s) => ({ ...s, shabadId: byId.get(s.id)?.shabad_id })),
    [segments, byId]
  );
  /** No seek: the point is to act on the other segment from where you are listening. */
  const chooseHere = (segmentId: string) => {
    setChosen(segmentId);
    setHeld(segmentId);
    setStripError(null);
  };

  /**
   * One edge, a second either way, then play from where it landed. On a cut
   * being marked it moves that start; on a segment it is an unsaved edit.
   */
  const nudge = useCallback(
    (edge: 'start' | 'end', by: number) => {
      if ((marking || naming) && start !== null) {
        if (edge === 'end' && end !== null) {
          const at = cents(Math.min(Math.max(start + MIN_LENGTH, end + by), duration || end + by));
          setEnd(at);
          player.playAt(at);
        } else {
          const at = cents(Math.max(0, Math.min(start + by, (end ?? Infinity) - MIN_LENGTH)));
          setStart(at);
          player.playAt(at);
        }
        return;
      }
      if (!focus || !focusSeg) return;
      const s = focusSeg.start;
      const e = focusSeg.end;
      const next =
        edge === 'start'
          ? { start: cents(Math.max(0, Math.min(s + by, e - MIN_LENGTH))), end: e }
          : {
              start: s,
              end: cents(Math.min(Math.max(s + MIN_LENGTH, e + by), duration || e + by)),
            };
      const same = next.start === Number(focus.start_sec) && next.end === Number(focus.end_sec);
      setMoved(same ? null : { id: focus.id, ...next });
      setStripError(null);
      setChosen(focus.id);
      player.playAt(edge === 'start' ? next.start : next.end);
    },
    [marking, naming, start, end, focus, focusSeg, duration, player]
  );

  /** A dragged handle on the strip's segment is the same unsaved edit as a nudge. */
  /**
   * An edge of the strip's segment at the playhead: the cut heard while
   * listening, rather than found by stepping. Refused past the other edge, as
   * a nudge is — never a range that ends before it starts.
   */
  const hereEdge = useCallback(
    (edge: 'start' | 'end') => {
      if (!focus || !focusSeg || !canEdit(focus)) return;
      const at = cents(position);
      if (edge === 'start' ? at > focusSeg.end - MIN_LENGTH : at < focusSeg.start + MIN_LENGTH) {
        setStripError(
          edge === 'start'
            ? 'The playhead is past this segment’s end — that would start it after it ends.'
            : 'The playhead is before this segment’s start.'
        );
        return;
      }
      const next = {
        start: edge === 'start' ? at : focusSeg.start,
        end: edge === 'end' ? at : focusSeg.end,
      };
      const same = next.start === Number(focus.start_sec) && next.end === Number(focus.end_sec);
      setMoved(same ? null : { id: focus.id, ...next });
      setChosen(focus.id);
      setStripError(null);
    },
    [focus, focusSeg, canEdit, position]
  );

  const mayCreate = can['renditions.propose'];

  /** Inside the strip's segment and allowed to move it: `[` and `]` are its edges, not a new cut. */
  const insideFocus =
    !marking &&
    !naming &&
    focus !== null &&
    focusSeg !== undefined &&
    canEdit(focus) &&
    position >= focusSeg.start &&
    position < focusSeg.end;
  /**
   * Before a chosen segment: `[` is its start, as `]` after it is its end —
   * a start heard early often lands in the row before, and a new cut there
   * would have been the wrong guess.
   */
  const beforeChosen =
    !marking &&
    !naming &&
    focus !== null &&
    focusSeg !== undefined &&
    chosen === focus.id &&
    canEdit(focus) &&
    position < focusSeg.start;

  const dragEdge = useCallback(
    (edge: 'start' | 'end', v: number) => {
      if (!focus || !focusSeg) return;
      setMoved({
        id: focus.id,
        start: edge === 'start' ? v : focusSeg.start,
        end: edge === 'end' ? v : focusSeg.end,
      });
      setStripError(null);
    },
    [focus, focusSeg]
  );

  // Nothing to drive until the recording is here — and a failed load's Try
  // again is a plain button, whose Space this handler would otherwise swallow.
  const hasRecording = Boolean(recording.data);

  /*
   * On the window, not on a wrapper: the page's own section has to be clicked
   * before it can receive a keystroke, so half the shortcuts did nothing until
   * you happened to click the background. Hands stay on the keyboard — a tagger
   * who reaches for the mouse between every cut tags a fraction as much.
   *
   * The handler reads this render's state, and most of it moves with the
   * playhead, so it is handed to one listener through a ref rather than
   * bound anew: bound directly, the listener was torn down and re-added on
   * every tick of playback. The ref is written in an effect, never during
   * render.
   */
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
      // Keep SHORTCUTS, the `?` list, in step with these cases.
      case 'ArrowUp':
        e.preventDefault();
        player.cycleSpeed(1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        player.cycleSpeed(-1);
        break;
      // Brackets, as every editor that trims media uses them. Inside the
      // strip's segment they move its edges; anywhere else `[` begins a
      // new one and `]` ends it — or, held after its end, stretches the
      // strip's segment out to the playhead, as `[` before a chosen one
      // stretches its start back.
      case '[':
        e.preventDefault();
        if (insideFocus || beforeChosen) hereEdge('start');
        // Not over unsaved edges: markStart drops them, and the strip hides
        // New here for the same reason — the key skipped that guard.
        else if (moved) setStripError('Save or undo the moved edges first.');
        else if (mayCreate) markStart();
        break;
      case ']':
        e.preventDefault();
        if (start !== null) markEnd();
        else if (focus) hereEdge('end');
        break;
      case 'f':
        // Not with a modifier: Cmd/Ctrl+F is the browser's find, and toggled
        // the zoom — and saved it — on its way past.
        if (canZoom && !e.metaKey && !e.ctrlKey && !e.altKey) toggleZoom();
        break;
      case ',':
        step(-1);
        break;
      case '.':
        step(1);
        break;
      case 'o':
        // Not with a modifier: Cmd/Ctrl+O is the browser's, as with `f`.
        if (alsoHere.length && !e.metaKey && !e.ctrlKey && !e.altKey) {
          // Through them in the list's order, so three are all reached — by
          // place in the list, as segments sharing a start have no "later".
          const ring = segments.filter((s) => s.id === focusSeg?.id || alsoHere.includes(s));
          const at = ring.findIndex((s) => s.id === focusSeg?.id);
          chooseHere(ring[(at + 1) % ring.length].id);
        }
        break;
      case 'Escape':
        if (moved) setMoved(null);
        else if (marking || naming) newForm(null, null);
        else setChosen(null);
        break;
    }
  }
  const keys = useRef(onKey);
  useEffect(() => {
    keys.current = onKey;
  });
  useEffect(() => {
    if (!hasRecording) return;
    const listen = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', listen);
    return () => window.removeEventListener('keydown', listen);
  }, [hasRecording]);

  /* ── What is done and what is left ────────────────────────────────────── */

  const untagged = duration ? untaggedSeconds(segments, duration) : null;
  const unpublished = rows.filter((r) => r.status !== 'published').length;

  /** Segments and the gaps between them on one axis, so the list reads as the recording does. */
  const listRows = useMemo(() => {
    const gaps = duration ? untaggedGaps(segments, duration) : [];
    return [
      ...rows.map((r) => ({ kind: 'segment' as const, at: Number(r.start_sec), r })),
      ...gaps.map((g) => ({ kind: 'gap' as const, at: g.start, g })),
    ].sort((a, b) => a.at - b.at);
  }, [rows, segments, duration]);

  const findings = useMemo(() => scan.data?.findings ?? [], [scan.data?.findings]);
  /** A pointer whose middle already sits inside tagged time is almost certainly done. */
  const covered = useCallback(
    (f: { start: number; end: number }) => {
      const mid = (f.start + f.end) / 2;
      return segments.some((s) => mid >= s.start && mid <= s.end);
    },
    [segments]
  );
  const pointers: TimelinePointer[] = useMemo(
    () => findings.map((f) => ({ start: f.start, end: f.end, name: f.name, covered: covered(f) })),
    [findings, covered]
  );

  function refreshRows() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['renditions', id] }),
      queryClient.invalidateQueries({ queryKey: ['recordings'] }),
      queryClient.invalidateQueries({ queryKey: ['recording', id] }),
      queryClient.invalidateQueries({ queryKey: ['pending'] }),
      // Deleting a scan draft drops the scan's pointers to that shabad too.
      queryClient.invalidateQueries({ queryKey: ['scan-request', id] }),
    ]);
  }

  /** The strip's writes: one at a time, its error shown in the strip. */
  async function act(work: () => Promise<unknown>) {
    // One write at a time: a second click on a lyric line while the first
    // was in flight raced it, each built from the row as it stood before.
    if (busy) return false;
    setBusy(true);
    setStripError(null);
    // A partial batch's "4 of 5" stops being true once a row changes by hand.
    setAcceptError(null);
    try {
      await work();
      return true;
    } catch (e) {
      setStripError(e instanceof Error ? e.message : 'Failed');
      return false;
    } finally {
      await refreshRows();
      setBusy(false);
    }
  }

  const perms = { review: can['renditions.review'], publish: can['renditions.publish'] };

  /**
   * The next segment still waiting after this one, read from the list as it
   * stood: the refetch a publish or delete just started has not landed yet.
   */
  function nextWaiting(r: Rendition) {
    const waiting = rows.filter(
      (x) => x.id !== r.id && x.status !== 'published' && Number(x.start_sec) > Number(r.start_sec)
    );
    return waiting.find((x) => canPublishRendition(x, perms, userId)) ?? waiting[0];
  }

  /** Publish, then on to the next one still waiting. */
  async function publish(r: Rendition) {
    const next = nextWaiting(r);
    const ok = await act(() => setRenditionStatus(supabase, r.id, 'published'));
    if (ok && next) goTo(next);
  }

  async function saveEdges() {
    if (!moved || !focus || focus.id !== moved.id) return;
    const edges = moved;
    if (await act(() => updateRendition(supabase, focus.id, recut(focus, edges)))) setMoved(null);
  }

  /**
   * The cut just ended, saved: linked to the shabad picked, or named by ear.
   * Then the strip has it like any other segment — Publish, or its line in
   * the lyrics first.
   *
   * The drafts it replaces go after it is saved, so a failed save loses
   * nothing. A scan draft of the very shabad picked is not one of them: its
   * deletion would be recorded as the scan being wrong, when it was only its
   * edges, so it takes the cut's edges instead of a new row being made.
   */
  async function saveCut(link: ShabadLink | null, byEar?: string) {
    if (start === null || end === null) return;
    const made: { row?: Rendition } = {};
    const going = replacing
      .map((c) => byId.get(c.id))
      .filter((r): r is Rendition => r !== undefined);
    const right = link
      ? going.find((r) => r.source === 'scan' && r.shabad_id === link.shabadId && canEdit(r))
      : undefined;
    const rest = going.filter((r) => r.id !== right?.id);
    // The one kind of delete the page can take back, as `removeRow` has it.
    const undoable =
      rest.length === 1 &&
      rest[0].created_by === userId &&
      rest[0].status !== 'published' &&
      rest[0].source !== 'scan'
        ? rest[0]
        : null;
    const ok = await act(async () => {
      if (right && link) {
        made.row = await updateRendition(supabase, right.id, {
          ...recut(right, { start, end }),
          name: link.titles.name,
          name_gurmukhi: link.titles.gurmukhi,
          shabad_id: link.shabadId,
          main_verse_id: link.verseId,
        });
      } else {
        made.row = await createRendition(
          supabase,
          {
            track_id: id,
            name: link ? link.titles.name : (byEar ?? ''),
            start_sec: cents(start),
            end_sec: cents(end),
            shabad_id: link?.shabadId ?? null,
            main_verse_id: link?.verseId ?? null,
            name_gurmukhi: link?.titles.gurmukhi ?? null,
            raag: null,
            taal: null,
          },
          userId
        );
      }
      if (!undoable) {
        for (const r of rest) await deleteRendition(supabase, r.id);
      }
    });
    // By the row, not `ok`: saved and a delete refused, the cut must not stay
    // open to be saved twice. The refusal is in the strip.
    if (made.row) {
      if (undoable && ok) setDoomed(undoable);
      newForm(null, null);
      setHeld(made.row.id);
      setChosen(made.row.id);
    }
  }

  /** A segment's shabad changed, or chosen for the first time: the link and both titles from its line. */
  async function relink(r: Rendition, link: ShabadLink) {
    const ok = await act(() =>
      updateRendition(supabase, r.id, {
        ...recut(r, { start: Number(r.start_sec), end: Number(r.end_sec) }),
        name: link.titles.name,
        name_gurmukhi: link.titles.gurmukhi,
        shabad_id: link.shabadId,
        main_verse_id: link.verseId,
      })
    );
    if (ok) setRenaming(null);
  }

  function saveMore(r: Rendition, more: { raag: string; taal: string }) {
    void act(() =>
      updateRendition(supabase, r.id, {
        ...recut(r, { start: Number(r.start_sec), end: Number(r.end_sec) }),
        raag: more.raag.trim() || null,
        taal: more.taal.trim() || null,
      })
    );
  }

  /**
   * What the scan heard over an unlinked draft becomes its shabad. Its name is
   * the scan's, roman only, until a line is chosen — publishing still asks for
   * that, so nothing goes out titled by a guess.
   */
  function applyScanHint(r: Rendition, f: ScanFinding) {
    void act(() =>
      updateRendition(supabase, r.id, {
        ...recut(r, { start: Number(r.start_sec), end: Number(r.end_sec) }),
        name: f.name,
        shabad_id: f.shabad_id,
        main_verse_id: null,
        name_gurmukhi: null,
      })
    );
  }

  /*
   * Deleting. A draft of your own, made by hand, goes at once with an Undo:
   * nobody else's listening goes with it. Anything else asks, with the same
   * question as ever — a scan draft's deletion is a rejection the scanner
   * keeps, so it is never undone by waiting.
   */
  function removeRow(r: Rendition) {
    const next = nextWaiting(r);
    const own = r.created_by === userId && r.status !== 'published' && r.source !== 'scan';
    if (own) {
      setMoved(null);
      setDoomed(r);
      if (next) goTo(next);
      return;
    }
    if (
      !confirm(
        `Delete “${r.name}”? This cannot be undone.${r.source === 'scan' ? " The scanner won't suggest it for this recording again." : ''}`
      )
    ) {
      return;
    }
    // Only once it has gone: a failed delete leaves the draft standing.
    void act(() => deleteRendition(supabase, r.id)).then((ok) => {
      if (ok && next) goTo(next);
    });
  }

  /*
   * The deferred delete. Its cleanup is what deletes when anything but Undo
   * ends the wait — a second delete, leaving the page — so a draft hidden as
   * deleted is never left standing. Undo marks the job done first.
   */
  useEffect(() => {
    if (!doomed) return;
    const job = { done: false };
    // Resolves once the rows are back without it: un-hidden any sooner, the
    // row reappeared for the length of the round trip.
    const go = async () => {
      if (job.done) return;
      job.done = true;
      try {
        await deleteRendition(supabase, doomed.id);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Delete failed');
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['renditions', id] }),
        queryClient.invalidateQueries({ queryKey: ['recordings'] }),
        queryClient.invalidateQueries({ queryKey: ['pending'] }),
      ]);
    };
    const timer = setTimeout(() => void go().then(() => setDoomed(null)), UNDO_MS);
    // False once the delete has gone: too late for Undo to keep the row.
    spare.current = () => {
      if (job.done) return false;
      job.done = true;
      return true;
    };
    return () => {
      clearTimeout(timer);
      void go();
    };
  }, [doomed, queryClient, id]);

  /*
   * One-click accept: the scan drafts this reviewer can publish, offered
   * together from two up — one has its own Publish. shabad_linked is what
   * the scanner writes; a scan row at 'draft' is one somebody unpublished, and
   * pulling it out of the player was a decision. Not while one of them is open
   * in the editor or has edges moved in the strip, which live in this page
   * until saved and would go out as the old ones, nor while this recording is
   * being scanned: a rescan adds drafts for shabads it newly finds, and they
   * would join a batch the reviewer had already checked.
   */
  const suggestions = rows.filter(
    (r) =>
      r.source === 'scan' && r.status === 'shabad_linked' && canPublishRendition(r, perms, userId)
  );
  const scanKind =
    scan.data && !scan.data.done_at ? scanStatus(scan.data, scan.dataUpdatedAt).kind : null;
  const scanUnderway = scanKind === 'starting' || scanKind === 'scanning' || scanKind === 'behind';
  const offerAccept =
    suggestions.length >= 2 && !suggestions.some((r) => r.id === moved?.id) && !scanUnderway;

  async function acceptSuggestions() {
    const ids = suggestions.map((r) => r.id);
    setAccepting(true);
    setAcceptError(null);
    try {
      await acceptScanDrafts(supabase, ids);
    } catch (e) {
      setAcceptError(e instanceof Error ? e.message : 'Failed');
    } finally {
      // Busy until the rows are back, so the button doesn't offer the same
      // drafts again in between.
      await refreshRows();
      setAccepting(false);
    }
  }

  /* ── The strip ────────────────────────────────────────────────────────── */

  let mode: StripMode;
  if (!duration || wholeFile || !recording.data) {
    mode = { kind: 'none' };
  } else if (marking && start !== null) {
    mode = { kind: 'marking', start, position };
  } else if (naming && start !== null && end !== null) {
    mode = { kind: 'naming', title: 'New shabad', start, end, note: 'Which shabad? Below ↓' };
  } else if (focus && focusSeg) {
    const r = focus;
    const refusal = publishRefusal(r, perms, userId);
    const missing = publishMissing(r);
    // Moved edges that now run into a neighbour: said, not refused — a
    // rendition can contain another, and the bar's sliver is easy to miss.
    const clash =
      moved?.id === r.id ? overlapping(segments, focusSeg, r.id).map((c) => c.name) : [];
    const here = shabadSegments.find((s) => s.id === r.id);
    const repeats = [
      ...(here ? sameShabadApart(shabadSegments, here) : []).map((x) => ({
        id: x.id,
        label: `here at ${clock(x.start)}`,
        trackId: null,
      })),
      ...(repeatsElsewhere.data ?? [])
        .filter((x) => x.shabad_id === r.shabad_id)
        .map((x) => ({
          id: x.id,
          label: `${x.tracks.date ?? 'undated'} at ${clock(x.start_sec)}`,
          trackId: x.track_id,
        })),
    ];
    const editable = canEdit(r);
    const published = r.status === 'published';
    const hintFinding =
      r.shabad_id == null && editable
        ? findings.find((f) => {
            const mid = (f.start + f.end) / 2;
            return mid >= focusSeg.start && mid <= focusSeg.end;
          })
        : undefined;
    mode = {
      kind: 'segment',
      name: r.name,
      start: focusSeg.start,
      end: focusSeg.end,
      tone: published ? 'published' : r.source === 'scan' ? 'scan' : 'draft',
      dirty: moved?.id === r.id,
      editable,
      /*
       * What is missing first, for anyone who may fix it: a contributor's own
       * draft named by ear needs its shabad whether or not they can publish
       * it, and publishRefusal says "permission" before it says "shabad".
       */
      primary:
        editable && missing === 'needs-shabad'
          ? hintFinding
            ? null
            : { label: 'Pick a shabad', onClick: () => renameRow(r) }
          : editable && missing === 'needs-line'
            ? {
                label: 'Pick its line',
                // Unfolded too: folded, it scrolled to a header with no lines.
                onClick: () => {
                  setLyricsOpen(true);
                  focusPanel();
                },
              }
            : refusal === null
              ? { label: 'Publish', onClick: () => void publish(r) }
              : published
                ? { note: '✓ Published', tone: 'done' }
                : { note: 'Waiting for review' },
      secondary:
        published && can['renditions.review']
          ? {
              label: 'Unpublish',
              onClick: () => void act(() => setRenditionStatus(supabase, r.id, 'draft')),
            }
          : null,
      overlaps: clash.length ? clash.join(', ') : null,
      hint: hintFinding
        ? { name: hintFinding.name, onUse: () => applyScanHint(r, hintFinding) }
        : null,
      // Only once playback has run on past it by itself, or well past a
      // chosen one: a cut being heard — its end time clicked, which lands the
      // playhead exactly on the end — is a cut being judged, not the next
      // shabad starting.
      timed: Boolean(r.line_timings?.length),
      offerNew:
        can['renditions.propose'] &&
        (position < focusSeg.start || position >= focusSeg.end) &&
        (chosen !== r.id || position > focusSeg.end + STRIP_HOLD_SECONDS),
      onDelete: canDeleteRendition(
        r,
        { propose: can['renditions.propose'], delete: can['renditions.delete'] },
        userId
      )
        ? () => removeRow(r)
        : null,
      alsoHere: alsoHere.map((s) => ({ id: s.id, name: s.name })),
      repeats,
      repeatsFailed: repeatsElsewhere.isError && r.shabad_id != null,
    };
  } else {
    const gap = gapAt(segments, duration, position);
    const pointer = findings.find(
      (f) => !covered(f) && position >= f.start - 5 && position <= f.end
    );
    mode = {
      kind: 'gap',
      ...gap,
      pointer: pointer ? { name: pointer.name } : null,
      canCreate: can['renditions.propose'],
    };
  }

  /*
   * What the bar's handles hold: a cut being made, or the whole file, else the
   * strip's segment when this account may move its edges.
   */
  const formCut = wholeFile || marking || naming;
  const handles = formCut
    ? { start: shownStart, end: shownEnd, onStart: changeStart, onEnd: changeEnd }
    : focus && focusSeg && canEdit(focus)
      ? {
          start: focusSeg.start,
          end: focusSeg.end,
          onStart: (v: number) => dragEdge('start', v),
          onEnd: (v: number) => dragEdge('end', v),
        }
      : null;

  /*
   * The old form, kept for one job: a recording that is one shabad end to end
   * (puratan, or any file somebody says is). It carries the filename's matches
   * and the Publish & next loop, and a puratan file trimmed of an applause
   * tail is still that job — so it stays once a boundary moves, until
   * something is saved. Everything else names its cut in the picker.
   */
  const formShown =
    can['renditions.propose'] &&
    wholeFileOffered &&
    (wholeFile || (naming && wholeFileChoice !== null));
  const picking = can['renditions.propose'] && naming && !formShown;
  /* Struck out only where the choice is on screen; the old form saves on its own terms. */
  const bands =
    picking && replacing.length
      ? plainBands.map((b) => ({ ...b, doomed: replacing.some((c) => c.id === b.id) }))
      : plainBands;
  const renamingRow = renaming ? (byId.get(renaming) ?? null) : null;

  /** An edge heard from the strip keeps the strip on its segment (see `chosen`). */
  const hear = (at: number) => {
    if (focus && !marking) setChosen(focus.id);
    player.playAt(at);
  };

  /** A seek on the bar is the tagger choosing a place: the playhead decides again. */
  const seekBar = (at: number) => {
    setChosen(null);
    player.seek(at);
  };

  const nextFinding = (f: TimelinePointer) => {
    setChosen(null);
    setHeld(null);
    playFrom(Math.max(0, f.start - 5));
  };

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
          <header className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="min-w-64 flex-1">
              <h1 className="font-display text-2xl font-semibold">{heading}</h1>
              <p className="text-sm text-muted-foreground">
                {recording.data.artist_dir ?? 'Unknown'}
                {recording.data.date ? ` · ${recording.data.date}` : ''}
                {` · ${recording.data.tree}`}
              </p>
            </div>

            {/* What is left, in one line: "is this one finished?" without
                counting rows. Untagged time uses the same predicate as the
                shelves, so the two cannot disagree about "done". */}
            <p className="text-sm text-muted-foreground">
              {[
                // A reviewer sees every draft; anyone else only their own,
                // and "all published" told them that while drafts waited.
                can['renditions.review']
                  ? unpublished
                    ? `${unpublished} to review`
                    : rows.length
                      ? 'all published'
                      : null
                  : unpublished
                    ? // Only a contributor's drafts wait on a reviewer; a
                      // publisher's own are theirs to publish.
                      can['renditions.publish']
                      ? `${unpublished} of yours to publish`
                      : `${unpublished} of yours in review`
                    : null,
                untagged == null
                  ? null
                  : coverageOpen(untagged)
                    ? `${clock(untagged)} untagged`
                    : 'all tagged',
                recording.data.tagged_done_at ? 'marked done' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              {offerAccept ? (
                <Button
                  size="sm"
                  disabled={accepting}
                  onClick={() => void acceptSuggestions()}
                  title="Publish every scan suggestion you’ve listened to"
                >
                  {accepting ? 'Publishing…' : `Publish all ${suggestions.length}`}
                </Button>
              ) : null}
            </div>
          </header>

          {acceptError || actionError ? (
            <p role="alert" className="-mt-2 text-sm text-destructive">
              {acceptError ?? actionError}
            </p>
          ) : null}

          {/* The transport follows you down the page: every job below it needs
              playback and the axis, and letting it scroll away meant scrolling
              back up to press play. Room above the bar for the handles' time
              labels, which the window's top edge cut off once it stuck. */}
          <div className="sticky top-0 z-20 -mx-1 flex flex-col gap-2 rounded-xl bg-background/95 p-2 pt-4 backdrop-blur">
            {/* Top-aligned: the scan pointers hang under the bar, so centring
                set the button against bar and pointers together and it sat
                below the bar. The bar is 40px and the button 36px. */}
            <div className="flex items-start gap-3">
              <Button
                size="icon"
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
              <div className="min-w-0 flex-1">
                <Timeline
                  segments={bands}
                  duration={duration}
                  position={position}
                  start={handles?.start ?? null}
                  end={handles?.end ?? null}
                  focusId={focusId}
                  moved={moved !== null && moved.id === focusId}
                  pointers={pointers}
                  view={barWindow}
                  onSeek={seekBar}
                  onPointer={nextFinding}
                  onChangeStart={handles?.onStart}
                  onChangeEnd={handles?.onEnd}
                  onAudition={player.playAt}
                  onDragStart={() => {
                    if (player.playing) player.toggle();
                  }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between pl-12 text-xs tabular-nums text-muted-foreground">
              <span>
                {clock(position)}
                {/* Speed is a setting you pick once and forget; ↑ ↓ cycle it
                    mid-listen. Shown as one quiet button that steps through. */}
                <button
                  type="button"
                  title="Playback speed (↑ ↓)"
                  onClick={() => player.cycleSpeed(1, true)}
                  className={cn(
                    'ml-2 rounded px-1 hover:bg-accent hover:text-foreground',
                    player.speed !== 1 && 'text-primary'
                  )}
                >
                  {player.speed}×
                </button>
                {/* The shortcuts, one tap away rather than a line of hints
                    that took the row the strip needs. */}
                <Popover>
                  <PopoverTrigger
                    aria-label="Keyboard shortcuts"
                    title="Keyboard shortcuts"
                    className="ml-1 rounded px-1.5 hover:bg-accent hover:text-foreground"
                  >
                    ?
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 text-xs">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                      {SHORTCUTS.map(([keys, what]) => (
                        <Fragment key={keys}>
                          <dt className="text-foreground">
                            <Kbd>{keys}</Kbd>
                          </dt>
                          <dd className="text-muted-foreground">{what}</dd>
                        </Fragment>
                      ))}
                    </dl>
                  </PopoverContent>
                </Popover>
              </span>
              <span>{clock(duration)}</span>
            </div>

            <SegmentStrip
              mode={mode}
              busy={busy}
              error={stripError}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              onNudge={nudge}
              onHere={hereEdge}
              onHear={hear}
              onSave={() => void saveEdges()}
              onUndo={() => {
                setMoved(null);
                setStripError(null);
              }}
              onStart={markStart}
              onEnd={markEnd}
              onCancel={() => newForm(null, null)}
              onAlsoHere={chooseHere}
              onRepeatHere={(segmentId) => {
                const r = byId.get(segmentId);
                if (r) goTo(r);
              }}
              onTagPointer={() => {
                const f = findings.find(
                  (x) => !covered(x) && position >= x.start - 5 && position <= x.end
                );
                if (f) tagPointer(f);
              }}
            />
          </div>

          {/* Under the player, one thing at a time: the picker for a cut that
              needs its shabad or a segment changing it, else the lyrics of
              the strip's segment. Nothing when the strip is on a gap. */}
          {picking && start !== null && end !== null ? (
            <div ref={panelRef}>
              {coveredDrafts.length ? (
                <CoveredChoice covered={coveredDrafts} replace={replace} onChange={setReplace} />
              ) : null}
              <ShabadPicker
                key={`new-${formKey}`}
                title={`Which shabad, ${clock(start)} to ${clock(end)}?`}
                // A warning, not a block: a rendition can legitimately contain
                // another — but a `[` pressed a beat early inside the last
                // shabad is the usual way one happens by accident.
                warning={
                  clipped.length
                    ? `Overlaps ${clipped.map((c) => c.name).join(', ')} — fine if you meant it.`
                    : null
                }
                seedName={seedName}
                busy={busy}
                onPick={(link) => void saveCut(link)}
                onByEar={(name) => void saveCut(null, name)}
                onCancel={() => newForm(null, null)}
              />
            </div>
          ) : renamingRow ? (
            <div ref={panelRef}>
              <ShabadPicker
                key={renamingRow.id}
                title={`Which shabad is “${renamingRow.name}”?`}
                busy={busy}
                onPick={(link) => void relink(renamingRow, link)}
                onCancel={() => setRenaming(null)}
              />
            </div>
          ) : focus?.shabad_id != null && !formShown ? (
            <div ref={panelRef}>
              <LyricsPanel
                key={focus.id}
                open={lyricsOpen}
                onOpenChange={setLyricsOpen}
                shabadId={focus.shabad_id}
                mainVerseId={focus.main_verse_id ?? null}
                raag={focus.raag ?? ''}
                taal={focus.taal ?? ''}
                editable={canEdit(focus)}
                busy={busy}
                onPickLine={(link) => void relink(focus, link)}
                onSaveMore={(more) => saveMore(focus, more)}
                onChangeShabad={() => renameRow(focus)}
              />
            </div>
          ) : null}

          {formShown ? (
            <div ref={panelRef}>
              <SegmentEditor
                // Remounts when the cut starts over, which is how the form
                // reloads itself — see the comment on its state block.
                key={`new-${formKey}`}
                trackId={id}
                userId={userId}
                segments={segments}
                start={shownStart}
                end={shownEnd}
                onMarkStart={markStart}
                onMarkEnd={markEnd}
                onChangeStart={changeStart}
                onChangeEnd={changeEnd}
                onAudition={player.playAt}
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
                onCancel={() => newForm(null, null)}
              />
            </div>
          ) : null}

          {rows.length === 0 ? (
            wholeFile || formShown ? null : (
              <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                <p>
                  Nothing tagged yet. Play through and press Start here where a shabad begins — both
                  ends can be nudged afterwards, so a rough pass is worth more than a perfect one.
                </p>
                {/* Any tree can hold a single-shabad file; puratan is just
                    where it is the default. The form it opens confirms the
                    filename's match and publishes in one go. */}
                {can['renditions.propose'] ? (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs text-muted-foreground"
                    onClick={() => setWholeFileChoice(true)}
                  >
                    The whole file is one shabad
                  </Button>
                ) : null}
              </div>
            )
          ) : (
            <ul aria-label="Segments" className="flex flex-col gap-0.5">
              {listRows.map((item) =>
                item.kind === 'gap' ? (
                  // The gaps used to be invisible: you could only find them
                  // by reading timestamps down the list and subtracting.
                  <li key={`gap-${item.g.start}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setChosen(null);
                        setHeld(null);
                        playFrom(item.g.start);
                      }}
                      className="flex w-full items-center gap-3 rounded-lg py-1.5 pr-3 pl-8 text-left text-xs text-muted-foreground hover:bg-accent/50"
                    >
                      <span className="flex-1 tabular-nums">
                        {clock(item.g.end - item.g.start)} untagged
                      </span>
                      <span className="tabular-nums">{clock(item.g.start)}</span>
                    </button>
                  </li>
                ) : (
                  <SegmentRow
                    key={item.r.id}
                    r={item.r}
                    current={item.r.id === focusId}
                    note={rowNote(item.r, publishRefusal(item.r, perms, userId), canEdit(item.r))}
                    possibleDuplicate={
                      item.r.shabad_id != null &&
                      (repeatsElsewhere.data?.some((x) => x.shabad_id === item.r.shabad_id) ||
                        shabadSegments.some(
                          (s) => s.id === item.r.id && sameShabadApart(shabadSegments, s).length > 0
                        ))
                    }
                    onOpen={() => goTo(item.r)}
                  />
                )
              )}
            </ul>
          )}

          {/* The recording's own jobs, after its segments: asking the scan
              again and calling the whole recording done are what you reach
              for once the list has been worked through. */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {can['scans.request'] ? (
              scan.data ? (
                scan.data.done_at ? (
                  <ScanAgainButton onClick={scanAgain} />
                ) : (
                  // The time of the last poll as "now": a value React can render
                  // twice, and it moves on every 30-second refetch anyway.
                  <ScanProgress
                    status={scanStatus(scan.data, scan.dataUpdatedAt)}
                    onAgain={scanAgain}
                  />
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

            {can['tracks.mark_done'] ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                // Said out loud: the mark hides this recording from In
                // progress for every tagger, not just this one.
                title={
                  recording.data.tagged_done_at
                    ? 'Put it back on the In progress shelf'
                    : 'Hides it from the In progress shelf for everyone'
                }
                onClick={() =>
                  void setTaggedDone(supabase, id, !recording.data?.tagged_done_at)
                    .then(() => {
                      void queryClient.invalidateQueries({ queryKey: ['recording', id] });
                      void queryClient.invalidateQueries({ queryKey: ['recordings'] });
                    })
                    .catch((e) => setActionError(e instanceof Error ? e.message : 'Failed'))
                }
              >
                {recording.data.tagged_done_at ? 'Unmark done' : 'Mark fully tagged'}
              </Button>
            ) : null}
            {recording.data.tagged_done_at ? (
              <span className="text-xs text-muted-foreground">
                {/* Said out loud: the mark hides this recording from In progress
                    for every tagger, not just this one. */}
                Marked fully tagged — hidden from the In progress shelf.
              </span>
            ) : null}
          </div>

          {/* Shown rather than hidden: a tagger who cannot publish should know
              that is a trust level, not a missing button. */}
          {can['renditions.propose'] ? (
            can['renditions.publish'] ? null : (
              <p className="text-xs text-muted-foreground">
                Your drafts go to review — publishing comes with the trust ladder.
              </p>
            )
          ) : (
            <p className="text-xs text-muted-foreground">
              Your account cannot create segments yet.
            </p>
          )}

          {doomed ? (
            <div
              role="status"
              className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-popover px-4 py-2 text-sm text-popover-foreground shadow-lg"
            >
              <span className="max-w-64 truncate">Deleted “{doomed.name}”</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (spare.current?.()) setDoomed(null);
                }}
              >
                Undo
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/**
 * What a row still needs, said only when it needs something. A published row
 * says nothing: its dot is green, and that is the whole story.
 */
function rowNote(
  r: Rendition,
  refusal: ReturnType<typeof publishRefusal>,
  editable: boolean
): string | null {
  if (r.status === 'published') return null;
  // What is missing before who may publish, as the strip asks it.
  const missing = publishMissing(r);
  if (missing === 'needs-shabad') return editable ? 'needs a shabad' : 'no shabad yet';
  if (missing === 'needs-line') return editable ? 'needs its line' : 'no line yet';
  if (r.source === 'scan') {
    return [
      // Until someone publishes it: the edges are a machine's guess (~5 s off
      // at the median on prod), worth checking by ear.
      'to review · check the edges',
      r.line_timings?.length && 'lyrics timed',
      // What it would have done had auto-publish been on — shown so a
      // reviewer can hold the verdict against their own ear. Called a
      // candidate: "would auto-publish" read as if it were on.
      r.scan_verdict?.auto && 'auto-publish candidate',
    ]
      .filter(Boolean)
      .join(' · ');
  }
  return refusal === 'permission' ? 'waiting for review' : 'to review';
}

/**
 * One segment in the list: the whole row is the button. It jumps there and
 * plays, and the strip under the bar takes over — so the list carries no
 * buttons of its own, and nothing it shows can disagree with the strip.
 */
function SegmentRow({
  r,
  current,
  note,
  possibleDuplicate,
  onOpen,
}: {
  r: Rendition;
  current: boolean;
  note: string | null;
  possibleDuplicate: boolean;
  onOpen: () => void;
}) {
  const published = r.status === 'published';
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={current || undefined}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent/50',
          current && 'bg-accent'
        )}
      >
        <span
          aria-hidden
          className={cn(
            'size-2 shrink-0 rounded-full',
            published
              ? 'bg-emerald-400'
              : r.source === 'scan'
                ? 'bg-warning'
                : 'bg-muted-foreground'
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{r.name}</span>
          {r.name_gurmukhi ? (
            <span lang="pa" className="block truncate font-gurbani text-sm text-muted-foreground">
              {r.name_gurmukhi}
            </span>
          ) : null}
        </span>
        {note ? (
          <span className="hidden text-xs text-muted-foreground sm:inline">{note}</span>
        ) : null}
        {possibleDuplicate ? (
          <span
            title="Possible duplicate: this ragi has this shabad elsewhere"
            className="flex shrink-0 items-center gap-1 text-xs text-primary"
          >
            <Copy aria-hidden className="size-3.5" />
            <span className="sr-only sm:not-sr-only">Possible duplicate</span>
          </span>
        ) : null}
        <span className="text-xs tabular-nums text-muted-foreground">
          {clock(Number(r.start_sec))}
        </span>
      </button>
    </li>
  );
}

function ScanAgainButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      <ScanLine />
      Scan again
    </Button>
  );
}

/**
 * Where an unfinished scan stands (#81). A run that never started, one still
 * going and one that failed on a dead sgpc.net URL all read "queued" before,
 * for as long as anyone waited.
 */
function ScanProgress({ status, onAgain }: { status: ScanStatus; onAgain: () => void }) {
  // The database lets run_url be nothing but a GitHub Actions run.
  const run = (url: string | null) =>
    url ? (
      <>
        {' · '}
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          view run
        </a>
      </>
    ) : null;
  const note = 'text-xs text-muted-foreground';
  switch (status.kind) {
    case 'starting':
      return <span className={note}>Starting a scan run…</span>;
    case 'scanning':
      return (
        <span className={note}>
          Scanning — its drafts appear here when it finishes{run(status.runUrl)}
        </span>
      );
    case 'behind':
      return (
        <span className={note}>Next in line, after the scan running now{run(status.runUrl)}</span>
      );
    case 'waiting':
      return (
        <>
          <span className={note}>
            No scan run has taken it yet — tonight&rsquo;s run will, or ask again
          </span>
          <ScanAgainButton onClick={onAgain} />
        </>
      );
    case 'failed':
      return (
        <>
          <span className="text-xs text-destructive">
            Scan failed: {status.error}
            {run(status.runUrl)}
          </span>
          <ScanAgainButton onClick={onAgain} />
        </>
      );
    case 'stopped':
      return (
        <>
          <span className={note}>
            The scan run stopped before it finished{run(status.runUrl)} — tonight&rsquo;s run tries
            again
          </span>
          <ScanAgainButton onClick={onAgain} />
        </>
      );
    case 'done':
      return null;
  }
}
