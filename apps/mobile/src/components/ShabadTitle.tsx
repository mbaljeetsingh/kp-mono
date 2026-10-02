/**
 * A rendition's title as a line of text, in the script the listener chose.
 *
 * A whole `Text` rather than a span inside one, unlike the web: React Native
 * cannot switch font family part-way through a line without nesting, and the
 * line's own classes (size, colour, weight) belong to the caller. The Gurmukhi
 * gets the Gurbani face and `accessibilityLanguage="pa"` — VoiceOver then reads
 * it in a Punjabi voice — and only the Gurmukhi does: a rendition with none
 * keeps its roman title in the line's own face.
 *
 * `gurmukhiClassName` replaces `className` rather than adding to it, because
 * two classes setting the same property resolve by stylesheet order, not by
 * the order written. The full player needs it: Noto Serif Gurmukhi's sihari
 * and bihari rise above the line, and Newsreader's leading clipped their tops.
 */
import { showsGurmukhi, type Playable } from '@kp/core';
import { Text, type TextProps } from 'react-native';

import { useTitleScript } from '~/lib/title-script';

export function ShabadTitle({
  item,
  className,
  gurmukhiClassName = className,
  ...props
}: TextProps & { item: Playable; className?: string; gurmukhiClassName?: string }) {
  const [script] = useTitleScript();
  const gurmukhi = showsGurmukhi(item, script);
  return (
    <Text
      {...props}
      accessibilityLanguage={gurmukhi ? 'pa' : undefined}
      className={gurmukhi ? `${gurmukhiClassName ?? ''} font-gurbani` : className}
    >
      {gurmukhi ? item.titleGurmukhi : item.title}
    </Text>
  );
}
