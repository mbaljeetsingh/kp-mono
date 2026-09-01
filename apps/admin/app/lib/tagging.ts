/**
 * How much a recording may leave untagged and still count as done.
 *
 * Demanding zero would empty the Done shelf: recordings legitimately open
 * with an untagged minute of announcements and trail off into a couple of
 * minutes nobody needs to hear, and untagged_seconds itself leans on the
 * filename's slot length, which disagrees with the audio by minutes. Five
 * minutes absorbs both. Anything past it is a shabad-sized hole, which is
 * work — the tag page's own bar for a gap worth listing is 45 seconds.
 *
 * Shared between the recordings list (shelf filters, row badge) and the tag
 * page (whether to offer "Mark fully tagged"), because the offer must appear
 * exactly where the shelves would otherwise hold the recording hostage —
 * two copies of this number is two definitions of done.
 */
export const DONE_SLACK_SECONDS = 300;

/**
 * Whether coverage alone still keeps this recording off the Done shelf.
 *
 * NULL untagged_seconds means the length is unknowable (no filename slot —
 * all of puratan), and unknown must read as "still open": the alternative is
 * a recording landing on Done because nobody can measure it. This is the one
 * predicate the shelf filters, the row badge and the mark-done offer all
 * derive from.
 */
export function coverageOpen(untaggedSeconds: number | null | undefined) {
  return untaggedSeconds == null || untaggedSeconds > DONE_SLACK_SECONDS;
}
