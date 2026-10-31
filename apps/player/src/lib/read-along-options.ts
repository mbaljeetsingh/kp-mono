/**
 * How this listener likes the read-along set, remembered on this device.
 *
 * In localStorage for the reason title-script.ts is: listening needs no account,
 * and the choice belongs to whoever is holding this screen. The rules are
 * @kp/core's, shared with the phone.
 */
import {
  DEFAULT_READ_ALONG_OPTIONS,
  readAlongOptionsFromJson,
  type ReadAlongOptions,
} from '@kp/core';
import { useLocalStorage } from 'usehooks-ts';

export function useReadAlongOptions(): [ReadAlongOptions, (next: ReadAlongOptions) => void] {
  const [options, setOptions] = useLocalStorage<ReadAlongOptions>(
    'kp:read-along',
    DEFAULT_READ_ALONG_OPTIONS,
    { deserializer: readAlongOptionsFromJson }
  );
  return [options, setOptions];
}
