/**
 * Live broadcasts.
 *
 * Every mount except Harimandir Sahib is relayed by SikhNet, on SikhNet's
 * bandwidth — the archive hotlinks sgpc.net, which is the organisation that
 * recorded it, and this is a different arrangement that should be visible
 * rather than implied. Hence the credit line at the foot.
 */
import { CHANNELS, DEFAULT_STATION, OTHER_GURDWARAS } from '@kp/core';

import { StationCard } from '~/components/StationCard';

export function RadioRoute() {
  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Radio</h1>
        <p className="text-sm text-muted-foreground">
          Live darbars, and feeds this archive does not hold.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        {/* Pinned above the list, and filtered out of it, so it does not render
            twice on the same page. */}
        <StationCard station={DEFAULT_STATION} featured />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Gurdwaras</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {OTHER_GURDWARAS.map((station) => (
            <StationCard key={station.id} station={station} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Channels</h2>
        <p className="text-xs text-muted-foreground">
          Programmed feeds — katha, simran, the unbroken reading. Nothing here overlaps the archive.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {CHANNELS.map((station) => (
            <StationCard key={station.id} station={station} />
          ))}
        </div>
      </div>

      <p className="border-t border-border pt-4 text-xs text-muted-foreground">
        Sri Harimandir Sahib is served by SGPC. Every other mount is relayed by{' '}
        <a href="https://www.sikhnet.com/radio" className="underline hover:text-foreground">
          SikhNet
        </a>
        , on SikhNet's bandwidth.
      </p>
    </section>
  );
}
