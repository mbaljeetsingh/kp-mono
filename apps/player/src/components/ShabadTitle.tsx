/**
 * A rendition's title, drawn in the script the listener chose.
 *
 * Inline, so it sits inside whatever line already sizes and truncates the
 * title. The Gurmukhi gets the Gurbani face and `lang="pa"` — a screen reader
 * then reads it in a Punjabi voice — and only the Gurmukhi does: a rendition
 * with none shows its roman title, in the face around it, unmarked.
 */
import { showsGurmukhi, type Playable } from '@kp/core';

import { useTitleScript } from '~/lib/title-script';

export function ShabadTitle({ item }: { item: Playable }) {
  const [script] = useTitleScript();
  if (!showsGurmukhi(item, script)) return <>{item.title}</>;
  return (
    <span lang="pa" className="font-gurbani">
      {item.titleGurmukhi}
    </span>
  );
}
