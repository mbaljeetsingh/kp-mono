import { describe, expect, it } from 'vitest';

import { acceptScanDrafts, canPublishRendition, draftSchema, scanStatus } from './admin';
import type { KpClient } from './client';

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

describe('scanStatus', () => {
  const asked = '2026-10-01T10:00:00Z';
  const at = (iso: string) => Date.parse(iso);
  const base = {
    requested_at: asked,
    started_at: null,
    done_at: null,
    run_url: null,
    error: null,
    findings: [],
    ahead: null,
  };
  const run = 'https://github.com/o/r/actions/runs/1';

  it('is done once done_at lands, whatever else the row says', () => {
    expect(scanStatus({ ...base, done_at: '2026-10-01T10:09:00Z', error: 'x' }, 0).kind).toBe(
      'done'
    );
  });

  it('is starting for the first minutes, then waiting when no run has taken it', () => {
    expect(scanStatus(base, at('2026-10-01T10:02:00Z')).kind).toBe('starting');
    expect(scanStatus(base, at('2026-10-01T10:06:00Z')).kind).toBe('waiting');
  });

  it('is next in line, not waiting, while a run is busy with another request', () => {
    const s = scanStatus({ ...base, ahead: { run_url: run } }, at('2026-10-01T10:30:00Z'));
    expect(s).toEqual({ kind: 'behind', runUrl: run });
  });

  it('is scanning once a run takes it, and says which run', () => {
    const s = scanStatus(
      { ...base, started_at: '2026-10-01T10:01:00Z', run_url: run },
      at('2026-10-01T10:20:00Z')
    );
    expect(s).toEqual({ kind: 'scanning', runUrl: run });
  });

  it('is failed with the reason, when the attempt for this ask failed', () => {
    const s = scanStatus(
      { ...base, started_at: '2026-10-01T10:01:00Z', error: 'could not fetch the recording' },
      at('2026-10-01T10:20:00Z')
    );
    expect(s).toEqual({ kind: 'failed', error: 'could not fetch the recording', runUrl: null });
  });

  it('ignores a start from before the latest ask: that was an earlier attempt', () => {
    const s = scanStatus(
      { ...base, started_at: '2026-10-01T09:00:00Z' },
      at('2026-10-01T10:01:00Z')
    );
    expect(s.kind).toBe('starting');
  });

  it('is stopped when a run took it longer ago than a run may last', () => {
    const s = scanStatus(
      { ...base, started_at: '2026-10-01T10:01:00Z', run_url: run },
      at('2026-10-01T13:02:00Z')
    );
    expect(s).toEqual({ kind: 'stopped', runUrl: run });
  });
});

describe('acceptScanDrafts', () => {
  /** Records the one statement the call builds, and answers with `result`. */
  function fakeClient(result: { data: { id: string }[] | null; error: unknown }) {
    const calls: string[] = [];
    const builder = {
      update: (values: unknown) => {
        calls.push(`update ${JSON.stringify(values)}`);
        return builder;
      },
      in: (col: string, values: string[]) => {
        calls.push(`in ${col} ${values.join(',')}`);
        return builder;
      },
      select: () => Promise.resolve(result),
    };
    const client = {
      from: (table: string) => {
        calls.push(`from ${table}`);
        return builder;
      },
    };
    return { client: client as unknown as KpClient, calls };
  }

  it('publishes the batch in one statement, by id, counting rows already published as done', async () => {
    const { client, calls } = fakeClient({ data: [{ id: 'a' }, { id: 'b' }], error: null });
    await acceptScanDrafts(client, ['a', 'b']);
    expect(calls).toEqual([
      'from renditions',
      'update {"status":"published"}',
      'in id a,b',
      'in status shabad_linked,published',
    ]);
  });

  it('says how many went through when RLS filters part or all of the batch', async () => {
    // A filtered batch comes back without an error, exactly like a whole one.
    const part = fakeClient({ data: [{ id: 'a' }], error: null }).client;
    await expect(acceptScanDrafts(part, ['a', 'b'])).rejects.toThrow('1 of 2 published');
    const none = fakeClient({ data: [], error: null }).client;
    await expect(acceptScanDrafts(none, ['a', 'b'])).rejects.toThrow('0 of 2 published');
  });

  it('throws the server error as an Error, so the page can show its message', async () => {
    // postgrest-js returns a plain object; the page reads anything that is not
    // an Error as "Failed". The code is what marks the message as PostgREST's.
    const { client } = fakeClient({
      data: null,
      error: { code: 'PGRST301', message: 'Your sign-in is being renewed. Try again in a moment.' },
    });
    const accepting = acceptScanDrafts(client, ['a']);
    await expect(accepting).rejects.toBeInstanceOf(Error);
    await expect(accepting).rejects.toThrow('Your sign-in is being renewed');
  });
});
