/**
 * The radio catalogue.
 *
 * A checked-in file rather than a table — see the `Station` doc comment in
 * `@kp/shared/types` for why, and for what would change that.
 *
 * Every mount except Harimandir Sahib is relayed by SikhNet, on SikhNet's
 * bandwidth. That is why `source` exists and why the Radio page carries a
 * credit line: the archive hotlinks sgpc.net, which is the same organisation
 * that recorded it, and this is a different arrangement that should be visible
 * rather than implied.
 *
 * One station SikhNet lists is deliberately absent. Gurdwara Gupatsar Sahib,
 * Manmad (`proxy/manmad/live`) answers with `icy-name: SikhNet Radio -
 * Channel 5 - Siri Akhand Path` — the mount is crossed with the Akhand Path
 * channel upstream, so tapping that gurdwara plays something else entirely
 * under its name. Wrong audio behind a right name is worse than an absence.
 * Re-add it if the mount ever reports its own station name.
 */
import stations from '@kp/shared/data/stations.json';
import type { Station } from '@kp/shared/types';
import type { Playable } from '~/composables/usePlayer';

export const STATIONS = stations as Station[];

/** Live darbars, in the order the file lists them: the takhats and the large
 *  historical gurdwaras first, then by country. */
export const GURDWARAS = STATIONS.filter((s) => s.kind === 'gurdwara');

/** Programmed 24-hour feeds — katha, simran, the unbroken reading. Nothing
 *  here overlaps the archive; they are the material this project does not have. */
export const CHANNELS = STATIONS.filter((s) => s.kind === 'channel');

/** What the Radio control in the sidebar and the tab bar starts, and the one
 *  feed served by the organisation that recorded the archive. */
export const DEFAULT_STATION = GURDWARAS[0]!;

/** The rest of the darbars. The featured station is pinned above the list, so
 *  leaving it in would render it twice on the same page. */
export const OTHER_GURDWARAS = GURDWARAS.filter(
  (s) => s.id !== DEFAULT_STATION.id
);

/** Namespaced so a station id can never collide with a segment uuid, and so a
 *  stray id in a log or in localStorage says what it is. */
export function stationPlayableId(station: Station): string {
  return `radio:${station.id}`;
}

export function stationPlayable(station: Station): Playable {
  return {
    id: stationPlayableId(station),
    title: station.name,
    // Location for a gurdwara, a line about the programme for a channel;
    // either way it is what belongs under the title in the player bar.
    subtitle: [station.place, station.quality].filter(Boolean).join(' · '),
    url: station.url,
    isLive: true,
  };
}

export function stationById(id: string | undefined | null): Station | null {
  if (!id) return null;
  return STATIONS.find((s) => stationPlayableId(s) === id) ?? null;
}
