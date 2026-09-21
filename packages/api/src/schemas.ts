/**
 * What the views actually return.
 *
 * Parsed rather than cast. The catalogue is 49k crawled rows with twenty years
 * of inconsistency behind it, and a column that is occasionally null is the
 * kind of thing that renders as `NaN` three components away from the cause.
 */
import { z } from 'zod';

export const lineTimingSchema = z.object({
  verse_id: z.number(),
  start: z.number(),
  end: z.number(),
});

/**
 * A row of the `shabads` view — a published, tagged rendition.
 *
 * `start_sec`/`end_sec` come back as numbers or numeric strings depending on
 * the column type PostgREST sees, and `toPlayable` handles both; the schema
 * only insists they are one of the two.
 */
export const shabadRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  track_id: z.string().nullish(),
  tree: z.string().nullish(),
  artist: z.string().nullish(),
  artist_display: z.string().nullish(),
  artist_photo: z.string().nullish(),
  raag: z.string().nullish(),
  taal: z.string().nullish(),
  shabad_id: z.number().nullish(),
  main_verse_id: z.number().nullish(),
  line_timings: z.array(lineTimingSchema).nullish(),
  start_sec: z.union([z.number(), z.string()]).nullish(),
  end_sec: z.union([z.number(), z.string()]).nullish(),
  duration_sec: z.union([z.number(), z.string()]).nullish(),
  play_count: z.number().nullish(),
  date: z.string().nullish(),
  created_at: z.string().nullish(),
});

export const artistSchema = z.object({
  name: z.string(),
  display_name: z.string().nullish(),
  photo_path: z.string().nullish(),
});

export type ShabadRow = z.infer<typeof shabadRowSchema>;
export type Artist = z.infer<typeof artistSchema>;

/**
 * Parse a list, dropping rows that do not fit rather than failing the page.
 *
 * A single malformed row out of fifty should cost that row, not the shelf —
 * this is a public archive, and an empty screen is worse than a short one.
 * The caller gets the count so it can be reported rather than hidden.
 */
export function parseRows<T>(
  schema: z.ZodType<T>,
  rows: unknown[]
): { rows: T[]; dropped: number } {
  const out: T[] = [];
  let dropped = 0;
  for (const row of rows) {
    const parsed = schema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
    else dropped += 1;
  }
  return { rows: out, dropped };
}
