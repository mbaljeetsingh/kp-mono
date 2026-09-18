/**
 * The scrubber.
 *
 * Reads position with a selector rather than the whole store: this is the one
 * component that genuinely needs 10Hz, and it should be the only thing paying
 * for it.
 */
import {
  progressPct,
  seekTargetForPct,
  elapsedIn,
  segmentTotal,
} from '@kp/core';
import { useRef } from 'react';

import { playerActions, usePlayer } from '~/lib/player';
import { clock } from '~/lib/utils';

export function SeekBar() {
  const current = usePlayer((s) => s.current);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const track = useRef<HTMLDivElement>(null);

  /**
   * A broadcast has no timeline to scrub and no end to scrub towards, and it
   * already says LIVE beside the title. Nothing is drawn rather than an inert
   * track: a greyed-out bar still claims there is a length to be part-way
   * through. The transport's column holds the height instead, so the bar does
   * not change size when a station starts.
   */
  if (current?.isLive) return null;

  const pct = progressPct(current, position, duration);

  function seekFromPointer(clientX: number) {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    playerActions.seek(seekTargetForPct(current, ratio * 100, duration));
  }

  return (
    <div className="flex w-full items-center gap-3">
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {clock(elapsedIn(current, position))}
      </span>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="group h-6 flex-1 cursor-pointer select-none py-2.5"
        onPointerDown={(e) => seekFromPointer(e.clientX)}
        onKeyDown={(e) => {
          // Five seconds, the same nudge the arrow keys give everywhere else.
          if (e.key === 'ArrowRight') playerActions.seek(position + 5);
          if (e.key === 'ArrowLeft') playerActions.seek(position - 5);
        }}
      >
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
        {clock(segmentTotal(current, duration))}
      </span>
    </div>
  );
}
