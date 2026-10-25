/**
 * A key, as the page draws it wherever it names one — on a button beside its
 * label, and in the shortcuts list — so `[` looks the same in both places.
 */
import type { ReactNode } from 'react';

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-current/30 px-1 font-sans text-[10px] leading-4 opacity-70">
      {children}
    </kbd>
  );
}
