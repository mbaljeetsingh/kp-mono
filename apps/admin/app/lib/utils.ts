import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Standard shadcn-vue class merger — later Tailwind utilities win. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
