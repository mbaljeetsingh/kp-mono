/**
 * The scrubber.
 *
 * Reads position with a selector rather than the whole store: this is the one
 * component that genuinely needs 10Hz, and it should be the only thing paying
 * for it.
 *
 * A bar you can drag, not a line you can tap. The first version seeked on
 * pointer-down and listened for nothing after it, so the one gesture everybody
 * brings to a player from every other player — press, drag, watch the clock,
 * let go — jumped once and then ignored the finger. The native app already
 * scrubs; this is the same behaviour with pointer events.
 */
import { progressPct, seekTargetForPct, elapsedIn, segmentTotal } from '@kp/core';
import { useRef, useState } from 'react';

import { playerActions, usePlayer } from '~/lib/player';
import { clock, cn } from '~/lib/utils';

export function SeekBar() {
  const current = usePlayer((s) => s.current);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const track = useRef<HTMLDivElement>(null);
  /** Percentage under the pointer while dragging, or null when not. */
  const [scrub, setScrub] = useState<number | null>(null);

  /**
   * A broadcast has no timeline to scrub and no end to scrub towards, and it
   * already says LIVE beside the title. Nothing is drawn rather than an inert
   * track: a greyed-out bar still claims there is a length to be part-way
   * through. The transport's column holds the height instead, so the bar does
   * not change size when a station starts.
   */
  if (current?.isLive) return null;

  /**
   * While a drag is in progress the bar follows the pointer rather than the
   * playhead, and the clock reads the dragged position. Without that the fill
   * springs back to wherever playback has got to on every status tick, ten
   * times a second, and the drag feels like it is fighting you.
   */
  const pct = scrub ?? progressPct(current, position, duration);
  const elapsed =
    scrub === null ? elapsedIn(current, position) : (scrub / 100) * segmentTotal(current, duration);

  function pctFromPointer(clientX: number): number | null {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width === 0) return null;
    return Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100));
  }

  /**
   * The seek lands on release, not on every move: a drag across a 70-minute
   * file is a few hundred pointer events, and seeking on each one is a few
   * hundred range requests for audio nobody will hear. What the listener is
   * reading during the drag is the clock, and that follows the pointer.
   */
  function commit(clientX: number) {
    const to = pctFromPointer(clientX) ?? scrub;
    if (to !== null) playerActions.seek(seekTargetForPct(current, to, duration));
    setScrub(null);
  }

  return (
    <div className="flex w-full items-center gap-3">
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {clock(elapsed)}
      </span>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        // `touch-none`, or a drag on a phone scrolls the page under the finger
        // instead of scrubbing — the gesture the browser assumes by default.
        className="group h-6 flex-1 cursor-pointer touch-none select-none py-2.5"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const to = pctFromPointer(e.clientX);
          if (to === null) return;
          // Capture, so the rest of the drag arrives here even when the pointer
          // leaves this 4px-high bar — which it does, immediately, every time.
          e.currentTarget.setPointerCapture(e.pointerId);
          setScrub(to);
        }}
        onPointerMove={(e) => {
          if (scrub === null) return;
          const to = pctFromPointer(e.clientX);
          if (to !== null) setScrub(to);
        }}
        onPointerUp={(e) => {
          if (scrub === null) return;
          commit(e.clientX);
        }}
        // A cancelled pointer is the system taking the gesture away — a phone
        // call, a back-swipe. Nobody asked to seek, so nothing seeks.
        onPointerCancel={() => setScrub(null)}
        onKeyDown={(e) => {
          // Five seconds, the same nudge the arrow keys give everywhere else.
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          // The app-wide shortcut nudges by the same five seconds, and with
          // this bar focused both handlers ran: one press, ten seconds. This is
          // the one that belongs to a focused slider, so it takes the key and
          // keeps it — including the scroll the arrow would otherwise cause,
          // which the shortcut used to prevent on this bar's behalf.
          e.preventDefault();
          e.stopPropagation();
          playerActions.seek(position + (e.key === 'ArrowRight' ? 5 : -5));
        }}
      >
        <div className="relative h-1 w-full">
          <div className="h-full w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          {/* Outside the fill's own bounds, so the rounded overflow that keeps
              the fill's corners clean cannot clip it. It grows under the
              pointer, which is the only feedback a handle this small can give,
              and it is what says the bar is draggable before anyone drags it. */}
          <div
            aria-hidden="true"
            style={{ left: `${pct}%` }}
            className={cn(
              'pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary transition-[width,height]',
              'group-hover:size-4 group-focus-visible:size-4',
              scrub !== null && 'size-4'
            )}
          />
        </div>
      </div>
      <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
        {clock(segmentTotal(current, duration))}
      </span>
    </div>
  );
}
