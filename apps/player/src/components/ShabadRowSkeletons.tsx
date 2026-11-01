/**
 * Rows standing in for a list that is loading.
 *
 * These are real ShabadRows greyed out from here, so a change to the row needs
 * no change to this file. Space is held from the first frame so nothing jumps,
 * but the rows stay blank for a moment: a fast load should not flash.
 */
import { PLACEHOLDER_PLAYABLE, SKELETON_DELAY_MS, SKELETON_ROWS } from '@kp/core';
import { useEffect, useState } from 'react';

import { ShabadRow } from '~/components/ShabadRow';
import { cn } from '~/lib/utils';

// The artwork's gradient is an inline style, which only !important can override.
// Lines sit flush against each other, so the bars are squeezed where only the eye
// sees it, which is what parts them without moving the layout.
const GREYED_OUT =
  '[&_[style]]:!bg-none [&_[style]]:bg-muted [&_button]:invisible [&_span]:invisible ' +
  '[&_p]:w-fit [&_p]:max-w-full [&_p]:scale-y-75 [&_p]:rounded [&_p]:bg-muted [&_p]:text-transparent';

export function ShabadRowSkeletons() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <p className="sr-only">Loading…</p>
      <div
        inert
        aria-hidden
        className={cn('flex flex-col gap-0.5', GREYED_OUT, show ? 'animate-pulse' : 'invisible')}
      >
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <ShabadRow key={i} item={PLACEHOLDER_PLAYABLE} isCurrent={false} playing={false} />
        ))}
      </div>
    </>
  );
}
