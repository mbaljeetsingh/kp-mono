/** A line with the words a search landed on picked out. */
import type { LineSegment } from '@kp/api';

export function MarkedLine({ parts }: { parts: LineSegment[] }) {
  return parts.map((part, i) =>
    part.match ? (
      <mark key={i} className="bg-transparent font-semibold text-primary">
        {part.text}
      </mark>
    ) : (
      part.text
    )
  );
}
