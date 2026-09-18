/**
 * Live broadcasts.
 *
 * The station list is static data shared with the Nuxt app — forty gurdwaras,
 * most of them dark at any given hour, which is why a station that fails to
 * start has to say so on its own card rather than leave a tap that appears to
 * do nothing.
 */
import type { Playable } from '@kp/core';
import type { Station } from '@kp/shared/types';
import stations from '@kp/shared/data/stations.json';
import { Radio } from 'lucide-react';

import { playerActions, usePlayer } from '~/lib/player';
import { cn } from '~/lib/utils';

/** `radio:` prefixed so a station id can never collide with a rendition id. */
function toPlayable(station: Station): Playable {
  return {
    id: `radio:${station.id}`,
    title: station.name,
    subtitle: station.place ?? undefined,
    url: station.url,
    isLive: true,
  };
}

export function RadioRoute() {
  const currentId = usePlayer((s) => s.current?.id);
  const playing = usePlayer((s) => s.playing);

  const list = (stations as Station[]).filter((s) => Boolean(s.url));

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Radio</h1>

      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((station) => {
          const isCurrent = `radio:${station.id}` === currentId;
          return (
            <button
              key={station.id}
              type="button"
              onClick={() =>
                isCurrent ? playerActions.toggle() : playerActions.play(toPlayable(station))
              }
              className={cn(
                'flex items-center gap-3 rounded-lg border border-border px-3 py-3 text-left hover:bg-accent/50',
                isCurrent && 'border-primary/50 bg-accent/60'
              )}>
              <Radio className={cn('size-4 shrink-0', isCurrent && 'text-primary')} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{station.name}</span>
                {station.place ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {station.place}
                  </span>
                ) : null}
              </span>
              {isCurrent && playing ? (
                <span className="shrink-0 text-xs font-medium text-primary">ON AIR</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
