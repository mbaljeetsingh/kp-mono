/**
 * The same `cn` the web package exports, so a component copied from React
 * Native Reusables needs no edit to its imports.
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
