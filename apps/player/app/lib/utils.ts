import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Batch size for PostgREST `in.(…)` filters.
 *
 * The filter travels in the query string, and past roughly 250 uuids the URL
 * crosses the gateway's URI limit: the request comes back 414, which in the
 * browser surfaces as a failed fetch rather than an error response — so the
 * promise rejects and everything downstream of it never runs. A favorites list
 * reaches that size after a few hundred saves, so it has to be batched.
 */
export const ID_BATCH = 100;

export function chunk<T>(items: T[], size = ID_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}
