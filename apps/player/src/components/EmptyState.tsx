import type { ReactNode } from 'react';

/**
 * What a shelf says when it has nothing.
 *
 * Always a sentence about this shelf, never a shrug: "Nothing here" tells a
 * listener nothing about whether to wait, search, or sign in.
 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <p className="text-sm">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-muted-foreground">{hint}</p> : null}
      {action}
    </div>
  );
}
