/**
 * The script this listener reads titles in, remembered on this phone.
 *
 * The phone's half of apps/player/src/lib/title-script.ts, over MMKV instead of
 * localStorage: read synchronously, so the first frame already shows the
 * chosen script, and through `useMMKVString`, so every row follows a change.
 * The rules — which title, which initials — are @kp/core's, shared with the web.
 */
import { parseTitleScript, titleIn, type Playable, type TitleScript } from '@kp/core';
import { useMMKVString } from 'react-native-mmkv';

import { mmkv } from './storage';

const KEY = 'kp:title-script';

export function useTitleScript(): [TitleScript, (script: TitleScript) => void] {
  const [raw, setRaw] = useMMKVString(KEY, mmkv);
  return [parseTitleScript(raw), (script) => setRaw(script)];
}

/** The same choice, read outside React — the store asks it for the lock screen. */
export function readTitleScript(): TitleScript {
  try {
    return parseTitleScript(mmkv.getString(KEY));
  } catch {
    return 'en';
  }
}

/** An item's title as this listener sees it, for labels rather than drawn text. */
export function useShownTitle(item: Playable): string {
  const [script] = useTitleScript();
  return titleIn(item, script);
}
