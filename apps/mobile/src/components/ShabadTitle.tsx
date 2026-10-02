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
 * The caller's own face and weight come off first. A second family class
 * resolves by stylesheet order, not by the order written, so a sheet's
 * `font-display-medium` would otherwise be what decides the Gurmukhi's face;
 * and the Gurbani face has one weight, which global.css says never to stack a
 * weight on (iOS happens to ignore a row's `font-medium`; that is luck, not
 * the contract).
 *
 * `gurmukhiClassName` replaces `className` outright where the line needs more:
 * the full player's, where Noto Serif Gurmukhi's sihari and bihari rise above
 * Newsreader's leading and had their tops clipped.
 */
import { showsGurmukhi, type Playable } from '@kp/core';
import { Text, type TextProps } from 'react-native';

import { useTitleScript } from '~/lib/title-script';

const FACE =
  /(^|\s)font-(display(-medium)?|thin|extralight|light|normal|medium|semibold|bold|extrabold|black)(?=\s|$)/g;

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
      className={
        gurmukhi ? `${(gurmukhiClassName ?? '').replace(FACE, '$1')} font-gurbani` : className
      }
    >
      {gurmukhi ? item.titleGurmukhi : item.title}
    </Text>
  );
}
