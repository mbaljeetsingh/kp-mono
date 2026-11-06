/**
 * One station's state and its tap, for every card that plays a broadcast —
 * Home's live card and Radio's list were copies, and drifted: Home's always
 * showed Play and restarted the stream on a second tap.
 */
import { stationPlayable, type Station } from '@kp/core';

import { playerActions, usePlayer } from './player';

export function useStation(station: Station) {
  const playable = stationPlayable(station);
  const isCurrent = usePlayer((s) => s.current?.id) === playable.id;
  const playing = usePlayer((s) => s.playing);
  // Set only by an explicit attempt — inferring it from "selected but not
  // playing" is equally true of a station somebody deliberately stopped.
  const connecting = usePlayer((s) => s.starting) === playable.id;

  return {
    isCurrent,
    /** On air: the card draws Pause. */
    onAir: isCurrent && playing,
    connecting,
    onPress: () => (isCurrent ? playerActions.toggle() : playerActions.play(playable)),
  };
}
