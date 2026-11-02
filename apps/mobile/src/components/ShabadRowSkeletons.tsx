/**
 * Rows standing in for a list that is loading.
 *
 * These are real ShabadRows in their `loading` state, so the row's layout has
 * one home. Space is held from the first frame so nothing jumps, but the rows
 * stay blank for a moment: a fast load should not flash.
 *
 * Only for `isLoading`. A request held for a connection is pending but not
 * loading, and a skeleton over it would shimmer for as long as the phone is
 * offline.
 */
import { PLACEHOLDER_PLAYABLE, SKELETON_DELAY_MS, SKELETON_ROWS } from '@kp/core';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ShabadRow } from '~/components/ShabadRow';

function ignorePress() {}

export function ShabadRowSkeletons() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={show ? 'animate-pulse' : 'opacity-0'}
    >
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <ShabadRow
          key={i}
          item={PLACEHOLDER_PLAYABLE}
          isCurrent={false}
          onPress={ignorePress}
          onMore={ignorePress}
          loading
        />
      ))}
    </View>
  );
}
