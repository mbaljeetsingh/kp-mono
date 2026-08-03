/**
 * What the timeline paints, in its own module because `<script setup>` cannot
 * carry ES exports — the transport and the axis both need these names.
 *
 * Deliberately not the `renditions` row shape: the axis only cares about a
 * span, a label and whether it is live, and keeping it to that lets the page
 * decide what "published" means without the component learning the enum.
 */
export type TimelineSegment = {
  id: string;
  start: number;
  end: number;
  name: string;
  published: boolean;
};

export type TimelinePointer = {
  start: number;
  end: number;
  name: string;
};
