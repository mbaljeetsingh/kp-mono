/**
 * How this listener likes the read-along set, remembered on this phone.
 *
 * The phone's half of apps/player/src/lib/read-along-options.ts, over MMKV: read
 * synchronously, so the first frame already has the chosen size. The rules are
 * @kp/core's, shared with the web.
 */
import { readAlongOptionsFromJson, type ReadAlongOptions } from '@kp/core';
import { useMemo } from 'react';
import { useMMKVString } from 'react-native-mmkv';

import { mmkv } from './storage';

export function useReadAlongOptions(): [ReadAlongOptions, (next: ReadAlongOptions) => void] {
  const [raw, setRaw] = useMMKVString('kp:read-along', mmkv);
  // Memoised because now-playing keys an effect on this, and that screen
  // re-renders with every position update.
  const options = useMemo(() => readAlongOptionsFromJson(raw), [raw]);
  return [options, (next) => setRaw(JSON.stringify(next))];
}
