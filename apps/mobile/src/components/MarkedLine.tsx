/** A line with the words a search landed on picked out, inside a parent `Text`. */
import type { LineSegment } from '@kp/api';
import { Text } from 'react-native';

export function MarkedLine({ parts }: { parts: LineSegment[] }) {
  return parts.map((part, i) => (
    <Text key={i} className={part.match ? 'font-semibold text-primary' : undefined}>
      {part.text}
    </Text>
  ));
}
