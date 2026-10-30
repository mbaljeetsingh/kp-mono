/**
 * "More · …": optional fields folded away under one quiet line.
 *
 * The same Collapsible the lyrics fold with, so the two disclosures on one
 * panel look and behave alike — a native <details> beside it drew the
 * browser's own triangle and focus ring.
 */
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@kp/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

export function More({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground">
        <ChevronDown className="size-3.5 -rotate-90 transition group-data-[panel-open]:rotate-0" />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}
