/**
 * The script this listener reads titles in, remembered on this device.
 *
 * English by default — what the player showed before there was a choice — and
 * kept in localStorage rather than an account: listening needs no account, and
 * the choice belongs to whoever is holding this screen. Every component reads
 * the same key through `useTitleScript`, which keeps them in step when it
 * changes; the store reads it through `readTitleScript` when it tells the lock
 * screen what is playing, which happens outside React.
 */
import { parseTitleScript, titleIn, type Playable, type TitleScript } from '@kp/core';
import { useLocalStorage } from 'usehooks-ts';

const KEY = 'kp:title-script';

function deserialize(raw: string): TitleScript {
  try {
    return parseTitleScript(JSON.parse(raw));
  } catch {
    return 'en';
  }
}

export function useTitleScript(): [TitleScript, (script: TitleScript) => void] {
  const [script, setScript] = useLocalStorage<TitleScript>(KEY, 'en', {
    deserializer: deserialize,
  });
  return [script, setScript];
}

/** The same choice, read outside React. Private mode throws; that reads as English. */
export function readTitleScript(): TitleScript {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? deserialize(raw) : 'en';
  } catch {
    return 'en';
  }
}

/**
 * An item's title as this listener sees it, for text that is read rather than
 * drawn — a label, a toast, a share message. Visible titles go through
 * `ShabadTitle`, which also sets the face and the language.
 */
export function useShownTitle(item: Playable): string {
  const [script] = useTitleScript();
  return titleIn(item, script);
}
