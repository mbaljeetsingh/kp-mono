/**
 * The transport, drawn the same in the bar and in the full player.
 *
 * Shared because there is more than one of them now, and three states of a
 * repeat control typed out twice is three states that drift.
 */
import { REPEAT_LABELS } from '@kp/core';
import { Button } from '@kp/ui/button';
import { Moon, Pause, Play, Repeat, Repeat1, SkipBack, SkipForward } from 'lucide-react';

import { playerActions, usePlayer } from '~/lib/player';
import { skipToNext } from '~/lib/skip';
import { cn } from '~/lib/utils';

export function PlayerControls({
  size = 'sm',
  compact = false,
}: {
  size?: 'sm' | 'lg';
  /**
   * Play and next only.
   *
   * Four icons beside a title on a phone leaves the title one character wide —
   * and four targets that narrow are hard to hit anyway. Everything else is one
   * tap away in the full player.
   */
  compact?: boolean;
}) {
  const playing = usePlayer((s) => s.playing);
  const repeat = usePlayer((s) => s.repeat);
  const isLive = usePlayer((s) => s.current?.isLive === true);
  const gentleStop = usePlayer((s) => s.gentleStop);
  // A broadcast and a raw file have no end to stop at.
  const hasEnd = usePlayer((s) => s.current?.endSec != null);

  const RepeatIcon = repeat === 'one' ? Repeat1 : Repeat;
  const big = size === 'lg';

  return (
    <div className="flex items-center gap-1">
      {/* Answers repeat on the right, which keeps the play button in the middle
          of this row, under a seek bar and beside a sheet that are both centred. */}
      {compact ? null : (
        <Button
          variant="ghost"
          size={big ? 'icon-lg' : 'icon'}
          disabled={!hasEnd}
          aria-label="Fade out and stop after this shabad"
          title="Fade out and stop after this shabad"
          aria-pressed={gentleStop}
          onClick={playerActions.toggleGentleStop}
          className={cn('rounded-full', gentleStop && 'text-primary')}
        >
          <Moon />
        </Button>
      )}

      {compact ? null : (
        <Button
          variant="ghost"
          size={big ? 'icon-lg' : 'icon'}
          // A broadcast has no previous — there is nothing behind live.
          disabled={isLive}
          aria-label="Previous"
          onClick={playerActions.previous}
          className="rounded-full"
        >
          <SkipBack />
        </Button>
      )}

      <Button
        size={big ? 'icon-lg' : 'icon'}
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={playerActions.toggle}
        className={cn('rounded-full', big && 'size-12')}
      >
        {playing ? <Pause /> : <Play />}
      </Button>

      <Button
        variant="ghost"
        size={big ? 'icon-lg' : 'icon'}
        disabled={isLive}
        aria-label="Next"
        // Not the store's `next`: at the end of a queue that is a dead button,
        // and this is where suggestions become reachable.
        onClick={() => void skipToNext()}
        className="rounded-full"
      >
        <SkipForward />
      </Button>

      {compact ? null : (
        <Button
          variant="ghost"
          size={big ? 'icon-lg' : 'icon'}
          // The name states what is on, not what a press would do — a cycle of
          // three has no single "would do", and aria-pressed would describe a
          // tri-state control as a toggle.
          aria-label={REPEAT_LABELS[repeat]}
          title={REPEAT_LABELS[repeat]}
          onClick={playerActions.cycleRepeat}
          className={cn('rounded-full', repeat !== 'off' && 'text-primary')}
        >
          <RepeatIcon />
        </Button>
      )}
    </div>
  );
}
