import { describe, expect, it } from 'vitest';

import { canPublishRendition, draftSchema } from './admin';

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

describe('canPublishRendition', () => {
  const reviewer = { review: true, publish: true };
  const trusted = { review: false, publish: true };
  const contributor = { review: false, publish: false };
  const ME = 'user-1';

  it('lets a reviewer publish anyone’s draft', () => {
    expect(canPublishRendition({ status: 'draft', created_by: 'someone-else' }, reviewer, ME)).toBe(
      true
    );
  });

  it('lets publish-without-review promote only their own', () => {
    expect(canPublishRendition({ status: 'draft', created_by: ME }, trusted, ME)).toBe(true);
    expect(canPublishRendition({ status: 'draft', created_by: 'other' }, trusted, ME)).toBe(false);
  });

  it('offers nothing while the session is still loading', () => {
    // Both sides undefined used to compare equal, so a trusted account saw a
    // Publish button on every row for as long as the session took to land —
    // the opposite of what the function documents.
    expect(canPublishRendition({ status: 'draft' }, trusted, undefined)).toBe(false);
    expect(canPublishRendition({ status: 'draft', created_by: null }, trusted, null)).toBe(false);
  });

  it('never offers it for something already published, or without the permission', () => {
    expect(canPublishRendition({ status: 'published', created_by: ME }, reviewer, ME)).toBe(false);
    expect(canPublishRendition({ status: 'draft', created_by: ME }, contributor, ME)).toBe(false);
  });
});
