import { describe, expect, it } from 'vitest';

import { parseRows, shabadRowSchema } from './schemas';

const valid = { id: 'r1', name: 'Sorath', url: 'https://x/a.mp3' };

describe('parseRows', () => {
  it('drops a malformed row rather than failing the whole shelf', () => {
    // A public archive with twenty years of inconsistency behind it: one bad
    // row out of fifty should cost that row, not the page.
    const { rows, dropped } = parseRows(shabadRowSchema, [valid, { id: 5 }, valid]);
    expect(rows).toHaveLength(2);
    expect(dropped).toBe(1);
  });

  it('accepts the nullable columns the views actually emit', () => {
    const { rows, dropped } = parseRows(shabadRowSchema, [
      { ...valid, artist: null, raag: null, line_timings: null, start_sec: null },
    ]);
    expect(dropped).toBe(0);
    expect(rows[0]!.artist).toBeNull();
  });

  it('accepts start_sec as a number or a numeric string', () => {
    expect(parseRows(shabadRowSchema, [{ ...valid, start_sec: 12 }]).dropped).toBe(0);
    expect(parseRows(shabadRowSchema, [{ ...valid, start_sec: '12' }]).dropped).toBe(0);
  });
});
