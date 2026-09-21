/**
 * One action sheet per screen, not one per row.
 *
 * A sheet mounted inside ShabadRow would be one mounted Modal per visible
 * shabad. The screen owns it, the rows just say which item was asked about.
 */
import type { Playable } from '@kp/core';
import { useCallback, useState } from 'react';

import { ShabadActions } from '~/components/ShabadActions';

export function useShabadActions() {
  const [item, setItem] = useState<Playable | null>(null);

  const onMore = useCallback((next: Playable) => setItem(next), []);
  const close = useCallback(() => setItem(null), []);

  return {
    onMore,
    sheet: <ShabadActions item={item} open={item !== null} onClose={close} />,
  };
}
