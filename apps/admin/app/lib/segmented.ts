/**
 * Selected-segment styling for `ButtonGroup` used as a segmented control.
 *
 * Every segment stays `variant="outline"` so the group keeps one continuous
 * border — `ButtonGroup` strips `border-l` from all but the first child, so a
 * borderless variant on the selected item punches a hole in the seam. Selection
 * is expressed through `aria-pressed` instead, which screen readers announce
 * and Tailwind styles. The `dark:` pairs are required: `outline` sets
 * `dark:bg-input/30`, which would otherwise win on compiled order.
 */
export const SELECTED_SEGMENT =
  'aria-pressed:border-primary/50 aria-pressed:bg-primary/15 aria-pressed:text-primary dark:aria-pressed:border-primary/50 dark:aria-pressed:bg-primary/15';
