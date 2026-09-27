/**
 * Puratan recordings set aside with "Skip for now".
 *
 * Memory, never the database: a skip means "not this one right now", not a
 * fact about the recording. A reload forgets it and other taggers never see
 * it. It still has to outlive a navigation, though. The queue always serves
 * the first untagged file in the ragi, so without this list the next Publish &
 * next would bounce straight back to the file just skipped.
 */
import { useSyncExternalStore } from 'react';

let skipped: string[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function skip(id: string) {
  if (!skipped.includes(id)) skipped = [...skipped, id];
  emit();
}

export function unskip(id: string) {
  skipped = skipped.filter((s) => s !== id);
  emit();
}

export function useSkipped(): string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => skipped
  );
}
