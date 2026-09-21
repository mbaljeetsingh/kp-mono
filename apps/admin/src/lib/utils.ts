import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** m:ss. Defined in @kp/core so the three apps cannot drift apart on it. */
export { clock } from '@kp/core';

/**
 * "3 months ago".
 *
 * Read at a glance where a date has to be subtracted from today first — which
 * matters on the users page, where account age is the question behind every
 * promotion. Intl rather than a dependency; the exact date goes in a title.
 */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';

  const seconds = Math.round((then - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];

  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(seconds, 'second');
}
