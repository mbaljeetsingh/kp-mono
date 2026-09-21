import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** m:ss. Defined in @kp/core so the three apps cannot drift apart on it. */
export { clock } from '@kp/core';
