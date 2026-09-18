/**
 * The recording, as a bar.
 *
 * Segments are drawn over an untagged background, so the holes are what stands
 * out — which is what a contributor is actually looking for. Published and
 * draft segments are told apart because picking up someone else's draft is the
 * duplicated work the queue's shelves exist to prevent.
 */
import { untaggedGaps, type TimelineSegment } from '@kp/core';

import { clock, cn } from '~/lib/utils';

interface Props {
  segments: TimelineSegment[];
  duration: number;
  position: number;
  onSeek: (seconds: number) => void;
}

export function Timeline({ segments, duration, position, onSeek }: Props) {
  // Without a duration there is no scale to draw against — a bar of unknown
  // width is worse than none.
  if (!duration) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
        Waiting for the recording's length…
      </div>
    );
  }

  const pct = (seconds: number) => `${Math.min(100, Math.max(0, (seconds / duration) * 100))}%`;
  const gaps = untaggedGaps(segments, duration);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative h-10 w-full cursor-pointer overflow-hidden rounded-lg bg-muted"
        role="slider"
        tabIndex={0}
        aria-label="Recording timeline"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(position)}
        onPointerDown={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          onSeek(((e.clientX - box.left) / box.width) * duration);
        }}
      >
        {segments.map((s) => (
          <div
            key={s.id}
            title={`${s.name} · ${clock(s.start)}–${clock(s.end)}`}
            className={cn('absolute inset-y-0', s.published ? 'bg-primary/70' : 'bg-primary/30')}
            style={{ left: pct(s.start), width: pct(s.end - s.start) }}
          />
        ))}

        <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: pct(position) }} />
      </div>

      <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>{clock(position)}</span>
        <span>{clock(duration)}</span>
      </div>

      {gaps.length ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Untagged, longest first
          </p>
          <div className="flex flex-wrap gap-1">
            {gaps.slice(0, 8).map((g) => (
              <button
                key={`${g.start}-${g.end}`}
                type="button"
                onClick={() => onSeek(g.start)}
                className="rounded-md border border-border px-2 py-1 text-xs tabular-nums text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              >
                {clock(g.start)}–{clock(g.end)}
                <span className="ml-1 opacity-60">({clock(g.end - g.start)})</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
