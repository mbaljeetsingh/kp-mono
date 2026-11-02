/**
 * The transport, drawn the same in the bar and in the full player.
 *
 * Shared because there is more than one of them now, and three states of a
 * repeat control typed out twice is three states that drift.
 */
import { REPEAT_LABELS } from '@kp/core';
import { Button } from '@kp/ui/button';
import {
  LoaderCircle,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react';

import { playerActions, usePlayer } from '~/lib/player';
import { useShuffle } from '~/lib/shuffle';
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
  const shuffled = usePlayer((s) => s.shuffleOrder !== null);
  const { shuffle, pending: shufflePending } = useShuffle();
  // Audio streams from sgpc.net, so a tap can be followed by seconds of silence.
  const starting = usePlayer((s) => s.starting !== null && s.starting === s.current?.id);

  const RepeatIcon = repeat === 'one' ? Repeat1 : Repeat;
  const big = size === 'lg';

  return (
    <div className="flex items-center gap-1">
      {compact ? null : (
        <Button
          variant="ghost"
          size={big ? 'icon-lg' : 'icon'}
          disabled={shufflePending}
          aria-label="Shuffle"
          aria-pressed={shuffled}
          title={shuffled ? 'Shuffle on' : 'Shuffle off'}
          onClick={shuffle}
          // Muted when off, here and on repeat: in the dark theme primary is too close
          // to the foreground for its colour alone to say which state this is in.
          // Invisible rather than gone on a broadcast, which has no order: play stays centred.
          className={cn(
            'rounded-full',
            shuffled ? 'text-primary' : 'text-muted-foreground',
            isLive && 'invisible'
          )}
        >
          <Shuffle />
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
        {starting ? <LoaderCircle className="animate-spin" /> : playing ? <Pause /> : <Play />}
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
          className={cn(
            'rounded-full',
            repeat === 'off' ? 'text-muted-foreground' : 'text-primary'
          )}
        >
          <RepeatIcon />
        </Button>
      )}
    </div>
  );
}
