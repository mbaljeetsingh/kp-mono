/**
 * The persistent transport.
 *
 * Never unmounts — it sits outside the router outlet, so navigating does not
 * interrupt playback or reset the queue.
 */
import { REPEAT_LABELS } from '@kp/core';
import { Button } from '@kp/ui/button';
import { Link } from '@tanstack/react-router';
import { Pause, Play, Repeat, Repeat1, SkipBack, SkipForward } from 'lucide-react';

import { SeekBar } from '~/components/SeekBar';
import { playerActions, usePlayer } from '~/lib/player';
import { cn } from '~/lib/utils';

export function PlayerBar() {
  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const repeat = usePlayer((s) => s.repeat);

  // Nothing loaded means no bar at all, rather than a dead strip of controls.
  if (!current) return null;

  const RepeatIcon = repeat === 'one' ? Repeat1 : Repeat;

  return (
    <footer className="border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{current.title}</p>
          {current.artist ? (
            <Link
              to="/ragis/$name"
              params={{ name: current.artist }}
              className="truncate text-xs text-muted-foreground hover:text-foreground">
              {current.subtitle ?? current.artist}
            </Link>
          ) : null}
        </div>

        <div className="flex flex-[2] flex-col items-center gap-1">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous"
              // A broadcast has no previous — there is nothing behind live.
              disabled={current.isLive}
              onClick={playerActions.previous}
              className="rounded-full">
              <SkipBack />
            </Button>
            <Button
              size="icon"
              aria-label={playing ? 'Pause' : 'Play'}
              onClick={playerActions.toggle}
              className="rounded-full">
              {playing ? <Pause /> : <Play />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next"
              disabled={current.isLive}
              onClick={playerActions.next}
              className="rounded-full">
              <SkipForward />
            </Button>
          </div>
          <SeekBar />
        </div>

        <div className="flex flex-1 justify-end">
          <Button
            variant="ghost"
            size="icon"
            // The name states what is on, not what a press would do — a cycle
            // of three has no single "would do", and aria-pressed would
            // describe a tri-state control as a toggle.
            aria-label={REPEAT_LABELS[repeat]}
            title={REPEAT_LABELS[repeat]}
            onClick={playerActions.cycleRepeat}
            className={cn('rounded-full', repeat !== 'off' && 'text-primary')}>
            <RepeatIcon />
          </Button>
        </div>
      </div>
    </footer>
  );
}
