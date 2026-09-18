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
 * above it take pointer events except the two drag handles.
 */
import { clock, untaggedGaps, type TimelineSegment } from '@kp/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import { MIN_LENGTH } from '~/lib/use-tag-player';
import { cn } from '~/lib/utils';

interface Props {
  segments: TimelineSegment[];
  duration: number;
  position: number;
  /** The cut being marked, mirrored here as a band with draggable ends. */
  start: number | null;
  end: number | null;
  /** The row open in the form, ringed so form and timeline stay linked. */
  editingId?: string | null;
  onSeek: (seconds: number) => void;
  onChangeStart?: (seconds: number) => void;
  onChangeEnd?: (seconds: number) => void;
  /** A boundary placed by drag is worth hearing immediately. */
  onAudition?: (seconds: number) => void;
}

/**
 * Enough ticks to read the axis, few enough to stay legible — which depends on
 * how wide the axis actually is, not only on how long the recording is. Picking
 * the step from duration alone printed "10:0015:0020:00" the moment the bar
 * got narrow.
 */
const TICK_STEPS = [30, 60, 120, 300, 600, 1800];

export function Timeline({
  segments,
  duration,
  position,
  start,
  end,
  editingId = null,
  onSeek,
  onChangeStart,
  onChangeEnd,
  onAudition,
}: Props) {
  const bar = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
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

  useEffect(() => {
    const node = bar.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /** Position on the axis as a percentage; null while the duration is unknown. */
  const pct = useCallback(
    (v: number | null): number | null => {
      if (v == null || !Number.isFinite(v) || !duration) return null;
      return Math.min(100, Math.max(0, (v / duration) * 100));
    },
    [duration]
  );

  const dragBoundary = useCallback(
    (which: 'start' | 'end', down: React.PointerEvent<HTMLButtonElement>) => {
      const rect = bar.current?.getBoundingClientRect();
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

      const place = (e: PointerEvent) => {
        const sec = ((e.clientX - rect.left) / rect.width) * duration;
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
        latest = Math.round(clamped * 100) / 100;
        if (which === 'start') onChangeStart?.(latest);
        else onChangeEnd?.(latest);
      };

      handle.addEventListener('pointermove', place);
      // Fires on pointerup and pointercancel alike, so one listener tears down.
      handle.addEventListener(
        'lostpointercapture',
        () => {
          handle.removeEventListener('pointermove', place);
          // A drag is placed by ear: loop across wherever the handle landed, so
          // the very next thing heard is whether the cut falls in the gap.
          if (latest != null && latest !== before) onAudition?.(latest);
        },
        { once: true }
      );
    },
    [duration, start, end, onChangeStart, onChangeEnd, onAudition]
  );

  // Without a duration there is no scale to draw against — a bar of unknown
  // width is worse than none.
  if (!duration) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
        Waiting for the recording's length…
      </div>
    );
  }

  const startPct = pct(start);
  const endPct = pct(end);
  const playPct = pct(position) ?? 0;
  const gaps = untaggedGaps(segments, duration);

  /*
   * Last match wins, matching what the eye sees: bands are painted in order, so
   * where two overlap the one drawn on top is the one being pointed at.
   */
  const hovered = hover
    ? [...segments].reverse().find((s) => hover.at >= s.start && hover.at <= s.end)
    : undefined;

  /** A span as CSS, with a floor so a 20-second shabad in a 90-minute set is
   *  still visible rather than a sub-pixel sliver. */
  const span = (from: number, to: number) => ({
    left: `${pct(from) ?? 0}%`,
    width: `${Math.max(0.35, (pct(to) ?? 0) - (pct(from) ?? 0))}%`,
  });

  const room = Math.max(2, Math.floor((width || 640) / 76));
  const step = TICK_STEPS.find((s) => duration / s <= room) ?? TICK_STEPS[TICK_STEPS.length - 1]!;
  const ticks: number[] = [];
  // Interior ticks only — the transport already prints 0:00 and the duration
  // either side of this bar, and a label at 100% would hang off the edge.
  for (let t = step; t < duration * 0.97; t += step) ticks.push(t);

  return (
    <div className="select-none">
      <div ref={bar} className="relative h-9">
        {/* Seek surface. Invisible but real, so click-to-seek and arrow keys
            come from the platform; the focus ring is drawn by the track below
            because an opacity-0 element cannot show one itself. */}
        <input
          type="range"
          min={0}
          max={100}
          step={0.01}
          value={(position / duration) * 100}
          aria-label="Seek"
          aria-valuetext={clock(position)}
          onChange={(e) => onSeek((duration * Number(e.target.value)) / 100)}
          onPointerMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            if (!box.width) return;
            const ratio = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
            setHover({ at: ratio * duration, ratio });
          }}
          onPointerLeave={() => setHover(null)}
          className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
        />

        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-md bg-muted/60 ring-1 ring-border/70 ring-inset peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
          {/* Published reads emerald and unpublished amber, the same pairing the
              recordings list and the row badges use, so "done" means one colour
              everywhere in the workbench. */}
          {segments.map((s) => (
            <div
              key={s.id}
              style={span(s.start, s.end)}
              className={cn(
                'absolute inset-y-0 flex items-center overflow-hidden rounded-sm px-1.5',
                s.published
                  ? 'bg-emerald-500/25 ring-1 ring-emerald-400/40 ring-inset'
                  : 'bg-amber-500/20 ring-1 ring-amber-400/35 ring-inset',
                s.id === editingId && 'ring-2 ring-primary'
              )}
            >
              <span
                className={cn(
                  'truncate text-[10px] leading-none',
                  s.published ? 'text-emerald-200/90' : 'text-amber-200/90'
                )}
              >
                {s.name}
              </span>
            </div>
          ))}

          {/* The cut being marked. Terracotta because it is the live thing on
              the page, and drawn over the saved blocks so an overlap is visible
              rather than hidden underneath. */}
          {startPct !== null && endPct !== null ? (
            <div
              className="absolute inset-y-0 rounded-sm bg-primary/30 ring-1 ring-primary/70 ring-inset"
              style={{
                left: `${startPct}%`,
                width: `${Math.max(0.35, endPct - startPct)}%`,
              }}
            />
          ) : null}
        </div>

        {/* Playhead over everything, with a nub at the top so it reads as a
            position rather than a divider between two blocks. */}
        <div
          className="pointer-events-none absolute -top-1 -bottom-1 z-20 w-px bg-foreground/80"
          style={{ left: `${playPct}%` }}
        >
          <span className="absolute -top-px -left-[3px] size-[7px] rounded-full bg-foreground" />
        </div>

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
                <span className={hovered.published ? 'text-emerald-300' : 'text-amber-300'}>
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

        {/* Handles last, and the only layer that takes pointer events besides
            the seek surface — a drag must never fall through to a seek. */}
        {startPct !== null ? (
          <button
            type="button"
            style={{ left: `${startPct}%` }}
            aria-label={`Segment start ${clock(start ?? 0)} — drag to move`}
            title={`Start ${clock(start ?? 0)} — drag to move`}
            onPointerDown={(e) => {
              e.preventDefault();
              dragBoundary('start', e);
            }}
            className="absolute top-1/2 z-30 h-11 w-2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-primary ring-1 ring-background focus-visible:ring-2 focus-visible:ring-ring"
          />
        ) : null}
        {endPct !== null ? (
          <button
            type="button"
            style={{ left: `${endPct}%` }}
            aria-label={`Segment end ${clock(end ?? 0)} — drag to move`}
            title={`End ${clock(end ?? 0)} — drag to move`}
            onPointerDown={(e) => {
              e.preventDefault();
              dragBoundary('end', e);
            }}
            className="absolute top-1/2 z-30 h-11 w-2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-primary ring-1 ring-background focus-visible:ring-2 focus-visible:ring-ring"
          />
        ) : null}
      </div>

      {ticks.length ? (
        <div className="relative mt-1 h-3">
          {ticks.map((t) => (
            <span
              key={t}
              style={{ left: `${pct(t)}%` }}
              className="absolute -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground/60"
            >
              {clock(t)}
            </span>
          ))}
        </div>
      ) : null}

      {gaps.length ? (
        <div className="mt-3 flex flex-col gap-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Untagged, longest first
          </p>
          <div className="flex flex-wrap gap-1">
            {gaps.slice(0, 6).map((g) => (
              <button
                key={`${g.start}-${g.end}`}
                type="button"
                onClick={() => onSeek(g.start)}
                className="rounded-md bg-accent/50 px-2 py-1 text-xs tabular-nums text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {clock(g.start)}–{clock(g.end)}
                <span className="ml-1 text-muted-foreground/60">({clock(g.end - g.start)})</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
