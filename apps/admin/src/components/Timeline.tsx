/**
 * The recording end to end: what is already tagged, where the playhead sits,
 * and the cut being marked right now.
 *
 * Every decision on this page answers one question — which minutes still need
 * somebody? A thin progress bar cannot answer it: saved work would exist only
 * as timestamps in the list below, so finding the gaps means reading rows and
 * doing arithmetic against a 90-minute duration. Painting the segments on the
 * same axis as the playhead makes the gaps the most obvious thing on the page,
 * which is the whole point.
 *
 * Seeking stays a real `<input type="range">` underneath the paint: it carries
 * click-to-seek, arrow keys and a focus ring for free, and none of the layers
 * above it take pointer events except the drag handles and the scan pointers.
 *
 * Flat bands, no outlines: an outline on every band drew a line at each
 * shabad's start and end, which read as a boundary marker on every segment
 * when only the one being cut has handles.
 */
import { clock, type TimelineSegment } from '@kp/core';
import { useCallback, useState } from 'react';

import { cents, MIN_LENGTH } from '~/lib/use-tag-player';
import { cn } from '~/lib/utils';

/** A band on the axis: published, a person's draft, or a scan draft nobody has published. */
export interface TimelineBand extends TimelineSegment {
  scan: boolean;
  /** Goes when the cut being named is saved: struck out over the cut, so it is seen first. */
  doomed?: boolean;
}

/** Something the scan heard and would not draft: a place worth a listen. */
export interface TimelinePointer {
  start: number;
  end: number;
  name: string;
  /** Its middle already sits inside a segment — shown faint, not hidden. */
  covered: boolean;
}

interface Props {
  segments: TimelineBand[];
  duration: number;
  position: number;
  /** The cut with handles: a segment being marked, or the one the strip has with its edits. */
  start: number | null;
  end: number | null;
  /** The segment the strip under the bar acts on, drawn brighter so the two read as one. */
  focusId?: string | null;
  /** The handles' edges are moved and not saved: their time labels say so. */
  moved?: boolean;
  pointers?: TimelinePointer[];
  /**
   * The stretch of the recording the bar spans, when it is zoomed to one cut.
   * Defaults to the whole recording. The caller derives it from the saved
   * edges, never the live ones, so the scale holds still while a handle is
   * dragged.
   */
  view?: { start: number; end: number } | null;
  onSeek: (seconds: number) => void;
  onPointer?: (pointer: TimelinePointer) => void;
  onChangeStart?: (seconds: number) => void;
  onChangeEnd?: (seconds: number) => void;
  /** A boundary placed by drag is worth hearing immediately. */
  onAudition?: (seconds: number) => void;
  /**
   * A handle started moving, zoomed in: the playhead sweeps past fast there,
   * so the caller can hold playback. Not on a bare click on a handle.
   */
  onDragStart?: () => void;
}

export function Timeline({
  segments,
  duration,
  position,
  start,
  end,
  focusId = null,
  moved = false,
  pointers = [],
  view = null,
  onSeek,
  onPointer,
  onChangeStart,
  onChangeEnd,
  onAudition,
  onDragStart,
}: Props) {
  /*
   * The bar's box, kept in state through a callback ref rather than read off a
   * ref object: the drag reads it when a handle goes down, and a ref read
   * there is fine, but the hover readout and the drag share it and a state
   * value keeps both honest across a resize.
   */
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  /**
   * What the pointer is over, as a fraction of the axis.
   *
   * Tracked from the seek surface rather than from the bands themselves: the
   * paint layer is `pointer-events-none` so that a click anywhere on the axis
   * seeks, which also means a band can never receive a hover — the `title` that
   * used to sit on them could not fire at all. Reading the position here gets
   * the label out of a 2px band as easily as a wide one.
   */
  const [hover, setHover] = useState<{ at: number; ratio: number } | null>(null);

  /** Position on the axis as a percentage; null while the duration is unknown. */
  const from = view ? Math.max(0, view.start) : 0;
  const to = view ? Math.min(duration, view.end) : duration;
  const width = Math.max(to - from, MIN_LENGTH);
  const pct = useCallback(
    (v: number | null): number | null => {
      if (v == null || !Number.isFinite(v) || !duration) return null;
      return Math.min(100, Math.max(0, ((v - from) / width) * 100));
    },
    [duration, from, width]
  );

  const dragBoundary = useCallback(
    (which: 'start' | 'end', down: React.PointerEvent<HTMLButtonElement>) => {
      const rect = bar?.getBoundingClientRect();
      if (!rect || !duration) return;
      const handle = down.currentTarget;
      // Capture keeps the drag alive once the pointer leaves the handle, which
      // it does immediately — and `touch-none` is what stops the page scrolling
      // instead on a touchscreen.
      handle.setPointerCapture(down.pointerId);
      // Where the boundary sat when the drag began, so teardown can tell a real
      // move from a stray click — only a move earns the audition.
      const before = which === 'start' ? start : end;
      let latest = before;
      // Held until the handle really moves: a click that only lands on a
      // handle — easy, zoomed in, where they sit at the cut's edges — must
      // not stop the playback it was meant to move.
      let held = false;

      const place = (e: PointerEvent) => {
        if (!held && view && Math.abs(e.clientX - down.clientX) > 2) {
          held = true;
          onDragStart?.();
        }
        // Held to the bar: past its end the time kept running while the handle
        // stayed pinned at the edge, so the cut moved and the handle did not.
        const sec = Math.min(
          to,
          Math.max(from, from + ((e.clientX - rect.left) / rect.width) * width)
        );
        /*
         * The 0-floor is applied last: with the end marked inside the first
         * tenth of a second the upper bound goes negative, and floor-then-min
         * would write a negative start — which the database rejects at save,
         * long after the drag that caused it.
         */
        const clamped =
          which === 'start'
            ? Math.max(0, Math.min(sec, (end ?? duration) - MIN_LENGTH))
            : Math.min(Math.max((start ?? 0) + MIN_LENGTH, sec), duration);
        // Two decimals matches what save writes, so a drag cannot leave
        // 12.299999999 behind for the nudges to inherit.
        latest = cents(clamped);
        if (which === 'start') onChangeStart?.(latest);
        else onChangeEnd?.(latest);
      };

      handle.addEventListener('pointermove', place);
      // Fires on pointerup and pointercancel alike, so one listener tears down.
      handle.addEventListener(
        'lostpointercapture',
        () => {
          handle.removeEventListener('pointermove', place);
          // A drag is placed by ear: play from wherever the handle landed, so
          // the very next thing heard is whether the cut falls in the gap.
          if (latest != null && latest !== before) onAudition?.(latest);
        },
        { once: true }
      );
    },
    [
      bar,
      duration,
      from,
      to,
      width,
      view,
      start,
      end,
      onChangeStart,
      onChangeEnd,
      onAudition,
      onDragStart,
    ]
  );

  // Without a duration there is no scale to draw against — a bar of unknown
  // width is worse than none.
  if (!duration) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
        Waiting for the recording's length…
      </div>
    );
  }

  const startPct = pct(start);
  /*
   * A cut being marked has no end yet, so its band runs to the playhead and
   * grows as it plays: the segment taking shape is visible while it is heard,
   * not only after `]`.
   */
  const growing = start !== null && end === null;
  const endPct = growing ? pct(Math.max(position, start)) : pct(end);
  const playPct = pct(position) ?? 0;

  /*
   * Last match wins, matching what the eye sees: bands are painted in order, so
   * where two overlap the one drawn on top is the one being pointed at.
   */
  const hovered = hover
    ? [...segments].reverse().find((s) => hover.at >= s.start && hover.at <= s.end)
    : undefined;

  /** A span as CSS, with a floor so a 20-second shabad in a 90-minute set is
   *  still visible rather than a sub-pixel sliver. */
  const span = (a: number, b: number) => ({
    left: `${pct(a) ?? 0}%`,
    width: `${Math.max(0.35, (pct(b) ?? 0) - (pct(a) ?? 0))}%`,
  });
  /** Zoomed in, a band or pointer wholly outside the window has no place on the bar. */
  const visible = (a: number, b: number) => b > from && a < to;

  return (
    <div className="select-none">
      <div ref={setBar} className="relative h-10">
        {/* Seek surface. Invisible but real, so click-to-seek and arrow keys
            come from the platform; the focus ring is drawn by the track below
            because an opacity-0 element cannot show one itself. */}
        <input
          type="range"
          min={0}
          max={100}
          step={0.01}
          value={Math.min(100, Math.max(0, ((position - from) / width) * 100))}
          aria-label="Seek"
          aria-valuetext={clock(position)}
          onChange={(e) => onSeek(from + (width * Number(e.target.value)) / 100)}
          onPointerMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            if (!box.width) return;
            const ratio = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
            setHover({ at: from + ratio * width, ratio });
          }}
          onPointerLeave={() => setHover(null)}
          className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
        />

        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg bg-muted/70 peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
          {/* Published reads emerald and unpublished amber, the same pairing the
              recordings list uses, so "done" means one colour everywhere in the
              workbench. A scan draft is hatched: its edges are a machine's
              guess until somebody publishes it. */}
          {segments
            .filter((s) => visible(s.start, s.end))
            .map((s) => (
              <div
                key={s.id}
                style={span(s.start, s.end)}
                className={cn(
                  'absolute inset-y-1 flex items-center overflow-hidden rounded-[4px] px-1.5',
                  // On top when chosen: a draft under a longer one was chosen
                  // and still hidden.
                  (s.id === focusId || s.doomed) && 'z-[1]',
                  // Text dark on light and light on dark: the pale label that
                  // read on the dark theme vanished on parchment.
                  s.doomed
                    ? 'bg-destructive/25 text-foreground line-through outline-1 -outline-offset-1 outline-destructive outline-dashed'
                    : s.id === focusId
                      ? s.published
                        ? 'bg-emerald-600 text-white'
                        : 'bg-warning text-warning-foreground'
                      : s.published
                        ? 'bg-emerald-600/20 text-emerald-900 dark:bg-emerald-500/25 dark:text-emerald-100'
                        : s.scan
                          ? 'bg-[repeating-linear-gradient(135deg,color-mix(in_srgb,var(--warning)_30%,transparent)_0_5px,color-mix(in_srgb,var(--warning)_12%,transparent)_5px_10px)] text-foreground'
                          : 'bg-warning/25 text-foreground'
                )}
              >
                <span
                  className={cn(
                    'truncate text-[10px] leading-none',
                    s.id === focusId && 'font-semibold'
                  )}
                >
                  {s.name}
                </span>
              </div>
            ))}

          {/* The cut being marked. Drawn over the saved blocks so an overlap is
              visible rather than hidden underneath. */}
          {startPct !== null && endPct !== null ? (
            <div
              className="absolute inset-y-1 rounded-[4px] bg-primary/45"
              style={{
                left: `${startPct}%`,
                width: `${Math.max(0.35, endPct - startPct)}%`,
              }}
            />
          ) : null}
        </div>

        {/* Playhead over everything. */}
        {/* Zoomed in, the playhead can be off the bar — skipped past a held
            segment, or back before a cut's start. Not drawn at the clamped
            edge, which would read as a position; said at that edge instead. */}
        {position >= from && position <= to ? (
          <div
            className="pointer-events-none absolute -top-0.5 -bottom-0.5 z-20 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
            style={{ left: `${playPct}%` }}
          />
        ) : (
          <div
            className={cn(
              'pointer-events-none absolute top-1/2 z-20 -translate-y-1/2 rounded bg-foreground px-1 text-[10px] leading-4 tabular-nums text-background',
              position < from ? 'left-0.5' : 'right-0.5'
            )}
          >
            {position < from ? `‹ ${clock(position)}` : `${clock(position)} ›`}
          </div>
        )}

        {/*
         * The readout. Above the axis rather than inside a band, because a
         * band narrow enough to truncate its name is also too narrow to hold a
         * tooltip — and the whole reason to hover is that the label was cut.
         * Clamped to the bar so it cannot hang off either end, and
         * pointer-events-none so it never steals the drag it is describing.
         */}
        {hover ? (
          <div
            className="pointer-events-none absolute -top-8 z-40 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow-md"
            style={{ left: `${Math.min(88, Math.max(12, hover.ratio * 100))}%` }}
          >
            {hovered ? (
              <>
                <span
                  className={
                    hovered.published
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-warning-strong'
                  }
                >
                  {hovered.name}
                </span>
                <span className="text-muted-foreground">
                  {' · '}
                  {clock(hovered.start)}–{clock(hovered.end)}
                </span>
              </>
            ) : (
              <span className="tabular-nums text-muted-foreground">{clock(hover.at)}</span>
            )}
          </div>
        ) : null}

        {/* Each handle's time, above it, when zoomed: there the edge is
            dragged by the second, and its time was only down in the strip,
            away from the drag. Not on the whole recording, where a cut is a
            sliver and the two labels would sit on each other. Gold once moved
            and not saved, as the strip's times are. */}
        {view
          ? [
              { at: start, p: startPct },
              { at: growing ? null : end, p: growing ? null : endPct },
            ].map(({ at, p }, i) =>
              at !== null && p !== null ? (
                <span
                  key={i}
                  className={cn(
                    'pointer-events-none absolute -top-4 z-30 -translate-x-1/2 rounded px-1 text-[10px] leading-4 tabular-nums',
                    moved ? 'bg-primary text-primary-foreground' : 'text-primary'
                  )}
                  style={{ left: `${p}%` }}
                >
                  {clock(at)}
                </span>
              ) : null
            )
          : null}

        {/* Handles last, and with the pointers the only layer that takes
            pointer events besides the seek surface — a drag must never fall
            through to a seek. Only on the edges of a finished cut: while
            marking, the end is the playhead. */}
        {startPct !== null && onChangeStart ? (
          <button
            type="button"
            style={{ left: `${startPct}%` }}
            aria-label={`Segment start ${clock(start ?? 0)} — drag to move`}
            title={`Start ${clock(start ?? 0)} — drag to move`}
            onPointerDown={(e) => {
              e.preventDefault();
              dragBoundary('start', e);
            }}
            className="absolute top-1/2 z-30 h-12 w-2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-primary ring-1 ring-background focus-visible:ring-2 focus-visible:ring-ring"
          />
        ) : null}
        {!growing && endPct !== null && onChangeEnd ? (
          <button
            type="button"
            style={{ left: `${endPct}%` }}
            aria-label={`Segment end ${clock(end ?? 0)} — drag to move`}
            title={`End ${clock(end ?? 0)} — drag to move`}
            onPointerDown={(e) => {
              e.preventDefault();
              dragBoundary('end', e);
            }}
            className="absolute top-1/2 z-30 h-12 w-2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-primary ring-1 ring-background focus-visible:ring-2 focus-visible:ring-ring"
          />
        ) : null}
      </div>

      {/* Scan pointers, under the axis rather than on it: a band already
          fills the axis at most of them, and a mark there would be one more
          line at a shabad's edge. Faint once covered, not gone — a pointer
          over the wrong tag is the one worth a second listen. */}
      {pointers.length ? (
        <div className="relative mt-0.5 h-5">
          {pointers
            .filter((p) => visible(p.start, p.end))
            .map((p) => (
              <button
                key={`${p.start}-${p.name}`}
                type="button"
                title={`Scan heard ${p.name} · ${clock(p.start)}–${clock(p.end)}`}
                aria-label={`Scan pointer: ${p.name} at ${clock(p.start)}`}
                onClick={() => onPointer?.(p)}
                style={{ left: `${pct(p.start) ?? 0}%` }}
                // The diamond is 10px; the button around it is 20px, and the
                // row is as tall as the button, so it never overhangs the
                // speed and ? buttons on the clock line below.
                className="group absolute top-0 flex size-5 -translate-x-1/2 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    'size-2.5 rotate-45 rounded-[1px] bg-primary transition group-hover:scale-125',
                    p.covered && 'opacity-35'
                  )}
                />
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}
