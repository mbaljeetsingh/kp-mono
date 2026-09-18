import { describe, expect, it } from 'vitest';

import { draftSchema } from './admin';

const base = { track_id: 't1', name: 'Sorath Mahala 5', start_sec: 60, end_sec: 105 };

describe('draftSchema', () => {
  it('accepts a minimal draft — a name and a range is the whole requirement', () => {
    expect(draftSchema.safeParse(base).success).toBe(true);
  });

  it('refuses a range that ends before it starts', () => {
    // Mirrors the rendition_ordered check constraint, so the form catches it
    // rather than Postgres returning an error nobody can read.
    const result = draftSchema.safeParse({ ...base, start_sec: 105, end_sec: 60 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['end_sec']);
  });

  it('refuses a zero-length range', () => {
    expect(draftSchema.safeParse({ ...base, start_sec: 60, end_sec: 60 }).success).toBe(false);
  });

  it('refuses a negative start, which the column also checks', () => {
    expect(draftSchema.safeParse({ ...base, start_sec: -1 }).success).toBe(false);
  });

  it('refuses a blank or whitespace-only name', () => {
    expect(draftSchema.safeParse({ ...base, name: '' }).success).toBe(false);
    expect(draftSchema.safeParse({ ...base, name: '   ' }).success).toBe(false);
  });

  it('trims the name, so a stray space never becomes part of the tag', () => {
    const parsed = draftSchema.parse({ ...base, name: '  Sorath  ' });
    expect(parsed.name).toBe('Sorath');
  });

  it('allows the optional tags to be absent or null', () => {
    expect(draftSchema.safeParse({ ...base, raag: null, artist: null }).success).toBe(true);
    expect(draftSchema.safeParse({ ...base, shabad_id: 1234 }).success).toBe(true);
  });

  it('never carries a status — publishing is a separate act and permission', () => {
    const parsed = draftSchema.parse({ ...base, status: 'published' } as never);
    expect('status' in parsed).toBe(false);
  });
});
