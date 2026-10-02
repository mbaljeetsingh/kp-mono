import { describe, expect, it } from 'vitest';

import {
  acceptScanDrafts,
  canDeleteRendition,
  canPublishRendition,
  draftSchema,
  fetchPending,
  fetchPendingCount,
  publishRefusal,
  scanStatus,
} from './admin';
import type { KpClient } from './client';
import { PAGE_SIZE } from './queries';

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

describe('canDeleteRendition', () => {
  const reviewer = { propose: true, delete: true };
  const contributor = { propose: true, delete: false };
  const blocked = { propose: false, delete: false };
  const ME = 'user-1';

  it('lets a contributor delete their own hand-made draft', () => {
    expect(
      canDeleteRendition({ status: 'draft', source: 'manual', created_by: ME }, contributor, ME)
    ).toBe(true);
  });

  it('keeps everything else with the permission', () => {
    // Someone else's draft, a published row, and a scan draft the account
    // requested: deleting that last one is a rejection, a reviewer's call.
    for (const row of [
      { status: 'draft', source: 'manual', created_by: 'other' },
      { status: 'published', source: 'manual', created_by: ME },
      { status: 'shabad_linked', source: 'scan', created_by: ME },
    ]) {
      expect(canDeleteRendition(row, contributor, ME)).toBe(false);
      expect(canDeleteRendition(row, reviewer, ME)).toBe(true);
    }
  });

  it('offers nothing to a blocked account or while the session is loading', () => {
    const own = { status: 'draft', source: 'manual', created_by: ME };
    expect(canDeleteRendition(own, blocked, ME)).toBe(false);
    expect(canDeleteRendition({ ...own, created_by: undefined }, contributor, undefined)).toBe(
      false
    );
  });
});

describe('canPublishRendition', () => {
  const reviewer = { review: true, publish: true };
  const trusted = { review: false, publish: true };
  const contributor = { review: false, publish: false };
  const ME = 'user-1';
  const linked = { shabad_id: 4064, main_verse_id: 50909 };

  it('lets a reviewer publish anyone’s draft', () => {
    expect(
      canPublishRendition({ status: 'draft', created_by: 'someone-else', ...linked }, reviewer, ME)
    ).toBe(true);
  });

  it('lets publish-without-review promote only their own', () => {
    expect(canPublishRendition({ status: 'draft', created_by: ME, ...linked }, trusted, ME)).toBe(
      true
    );
    expect(
      canPublishRendition({ status: 'draft', created_by: 'other', ...linked }, trusted, ME)
    ).toBe(false);
  });

  it('offers nothing while the session is still loading', () => {
    // Both sides undefined used to compare equal, so a trusted account saw a
    // Publish button on every row for as long as the session took to land —
    // the opposite of what the function documents.
    expect(canPublishRendition({ status: 'draft', ...linked }, trusted, undefined)).toBe(false);
    expect(
      canPublishRendition({ status: 'draft', created_by: null, ...linked }, trusted, null)
    ).toBe(false);
  });

  it('never offers it for something already published, or without the permission', () => {
    expect(
      canPublishRendition({ status: 'published', created_by: ME, ...linked }, reviewer, ME)
    ).toBe(false);
    expect(
      canPublishRendition({ status: 'draft', created_by: ME, ...linked }, contributor, ME)
    ).toBe(false);
  });

  it('never offers it with no shabad linked, even to a reviewer', () => {
    // There is no line to title it from: it would go out roman-only. The
    // database refuses it as well; this is what keeps the button away.
    expect(canPublishRendition({ status: 'draft', shabad_id: null }, reviewer, ME)).toBe(false);
    expect(canPublishRendition({ status: 'draft', created_by: ME }, trusted, ME)).toBe(false);
  });

  it('nor with a shabad but no main verse, the line both titles come from', () => {
    expect(
      canPublishRendition({ status: 'draft', shabad_id: 4064, main_verse_id: null }, reviewer, ME)
    ).toBe(false);
  });
});

describe('publishRefusal', () => {
  const reviewer = { review: true, publish: true };
  const trusted = { review: false, publish: true };
  const contributor = { review: false, publish: false };
  const ME = 'user-1';
  const unlinked = { status: 'draft', shabad_id: null, main_verse_id: null };

  it('says "needs a shabad" only to someone for whom linking is all that is missing', () => {
    // A hint that tells a contributor, or a trusted account looking at someone
    // else's draft, to link a shabad promises a Publish that would not come.
    expect(publishRefusal({ ...unlinked, created_by: ME }, trusted, ME)).toBe('needs-shabad');
    expect(publishRefusal({ ...unlinked, created_by: 'other' }, reviewer, ME)).toBe('needs-shabad');
    expect(publishRefusal({ ...unlinked, created_by: 'other' }, trusted, ME)).toBe('permission');
    expect(publishRefusal({ ...unlinked, created_by: ME }, contributor, ME)).toBe('permission');
  });

  it('asks for the main verse once the shabad is there', () => {
    expect(
      publishRefusal({ status: 'draft', shabad_id: 4064, main_verse_id: null }, reviewer, ME)
    ).toBe('needs-line');
  });

  it('calls a published row published, linked or not', () => {
    expect(publishRefusal({ ...unlinked, status: 'published' }, reviewer, ME)).toBe('published');
  });

  it('answers null when nothing stands in the way', () => {
    expect(
      publishRefusal({ status: 'draft', shabad_id: 4064, main_verse_id: 50909 }, reviewer, ME)
    ).toBeNull();
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
      not: (col: string, op: string, value: unknown) => {
        calls.push(`not ${col} ${op} ${String(value)}`);
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
      // Left out rather than refused: one unlinked since the page loaded must
      // not stop the rest publishing.
      'not shabad_id is null',
      'not main_verse_id is null',
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

describe('fetchPending', () => {
  /** Records the chain; `limit` ends it, the way PostgREST resolves it. */
  function fakeClient(result: { data: unknown[] | null; error: unknown }) {
    const calls: string[] = [];
    const builder = {
      select: (cols: string) => {
        calls.push(`select ${cols}`);
        return builder;
      },
      neq: (col: string, value: string) => {
        calls.push(`neq ${col} ${value}`);
        return builder;
      },
      or: (filter: string) => {
        calls.push(`or ${filter}`);
        return builder;
      },
      order: (col: string, opts: { ascending: boolean }) => {
        calls.push(`order ${col} ${opts.ascending ? 'asc' : 'desc'}`);
        return builder;
      },
      limit: (n: number) => {
        calls.push(`limit ${n}`);
        return Promise.resolve(result);
      },
    };
    const client = {
      from: (table: string) => {
        calls.push(`from ${table}`);
        return builder;
      },
    };
    return { client: client as unknown as KpClient, calls };
  }

  const full = Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: `r${i}` }));

  it('starts at the oldest draft, with id breaking ties', async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await fetchPending(client);
    expect(calls).toEqual([
      'from renditions',
      'select *, tracks(artist_dir, date, url, raw_filename)',
      'neq status published',
      'order created_at asc',
      'order id asc',
      `limit ${PAGE_SIZE}`,
    ]);
  });

  it('continues just after the last row, not at an offset a removal would shift', async () => {
    const { client, calls } = fakeClient({ data: full, error: null });
    await fetchPending(client, { created_at: '2026-10-01T12:00:00.5+00:00', id: 'abc' });
    expect(calls).toContain(
      'or created_at.gt."2026-10-01T12:00:00.5+00:00",' +
        'and(created_at.eq."2026-10-01T12:00:00.5+00:00",id.gt.abc)'
    );
  });

  it('has more after a full page and stops after a short one', async () => {
    expect((await fetchPending(fakeClient({ data: full, error: null }).client)).hasMore).toBe(true);
    const short = await fetchPending(fakeClient({ data: full.slice(1), error: null }).client);
    expect(short.hasMore).toBe(false);
    expect(short.items).toHaveLength(PAGE_SIZE - 1);
  });

  it('throws the server error as an Error', async () => {
    const { client } = fakeClient({ data: null, error: { code: 'PGRST000', message: 'down' } });
    await expect(fetchPending(client)).rejects.toBeInstanceOf(Error);
  });
});

describe('fetchPendingCount', () => {
  it('counts everything unpublished without fetching a row', async () => {
    const calls: string[] = [];
    const client = {
      from: (table: string) => {
        calls.push(`from ${table}`);
        return {
          select: (cols: string, opts: unknown) => {
            calls.push(`select ${cols} ${JSON.stringify(opts)}`);
            return {
              neq: (col: string, value: string) => {
                calls.push(`neq ${col} ${value}`);
                return Promise.resolve({ count: 137, error: null });
              },
            };
          },
        };
      },
    } as unknown as KpClient;
    expect(await fetchPendingCount(client)).toBe(137);
    expect(calls).toEqual([
      'from renditions',
      'select id {"count":"exact","head":true}',
      'neq status published',
    ]);
  });
});
