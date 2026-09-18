/**
 * One station.
 *
 * A station that fails to start says so on its own card. A dark mount is the
 * normal state for half these gurdwaras at any hour, and leaving a tap that
 * appears to do nothing is worse than saying "off air".
 */
import { stationPlayable, type Station } from '@kp/core';
import { Radio } from 'lucide-react';

import { LiveBadge } from '~/components/LiveBadge';
import { playerActions, usePlayer } from '~/lib/player';
import { cn } from '~/lib/utils';

export function StationCard({ station, featured }: { station: Station; featured?: boolean }) {
  const playable = stationPlayable(station);
  const currentId = usePlayer((s) => s.current?.id);
  const playing = usePlayer((s) => s.playing);
  const starting = usePlayer((s) => s.starting);

  const isCurrent = currentId === playable.id;
  const isStarting = starting === playable.id;

  return (
    <button
      type="button"
      onClick={() => (isCurrent ? playerActions.toggle() : playerActions.play(playable))}
      className={cn(
        'flex items-center gap-3 rounded-xl border border-border px-3 py-3 text-left hover:bg-accent/50',
        featured && 'bg-accent/30',
        isCurrent && 'border-primary/50 bg-accent/60'
      )}>
      <Radio className={cn('size-4 shrink-0', isCurrent && 'text-primary')} />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{station.name}</span>
        {station.place ? (
          <span className="block truncate text-xs text-muted-foreground">{station.place}</span>
        ) : null}
      </span>

      {/* "Connecting…" is set only by an explicit attempt. Inferring it from
          "selected but not playing" is equally true of a station the listener
          deliberately stopped, which left cards reading Connecting for as long
          as they stayed selected. */}
      {isStarting ? (
        <span className="shrink-0 text-xs text-muted-foreground">Connecting…</span>
      ) : isCurrent && playing ? (
        <LiveBadge />
      ) : null}
    </button>
  );
}
