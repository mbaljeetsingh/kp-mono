/**
 * The trust ladder, end to end: the numbers the sidebar card reads
 * (fetchStanding) and the promotion they lead to (maybe_promote).
 *
 * The card's TRUSTED_AT is a copy of the trigger's threshold, so this walks a
 * contributor to exactly that count: one short, still a contributor; the
 * publish that makes it, trusted. A drift between the two fails here rather
 * than as a bar that reads 20/20 under the word "contributor".
 *
 * Same rules as permissions.db.test.ts: local stack only, the seed accounts,
 * every row tagged with this run and removed in afterAll, no source='scan'
 * rows (whose deletion records a rejection), and the contributor put back to
 * `contributor` whatever happens.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, inject, it } from 'vitest';

import { fetchStanding, TRUSTED_AT } from './admin';

// Local seed accounts only (supabase/seed.sql). Never real credentials.
const PASSWORD = 'password';
const TAG = `kp-ladder-${Date.now().toString(36)}`;

async function signedIn(email: string): Promise<{ db: SupabaseClient; id: string }> {
  const db = createClient(inject('supabaseUrl'), inject('supabaseKey'), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `kp-ladder-${email}`,
    },
  });
  const { data, error } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.user) {
    throw new Error(`Could not sign in as ${email} (is the seed loaded?): ${error?.message}`);
  }
  return { db, id: data.user.id };
}

/**
 * Publishing needs a shabad and its main verse; an empty timing list keeps the
 * row out of align's queue, so the dispatch trigger has nothing to start (as
 * LINKED in permissions.db.test.ts).
 */
const LINKED = { shabad_id: 1, main_verse_id: 1, line_timings: [] };

let admin: SupabaseClient;
let contributor: SupabaseClient;
let contributorId: string;
let ids: string[] = [];
let before: { published: number; pending: number };

async function publish(n: number) {
  const batch = ids.splice(0, n);
  const { error } = await admin.from('renditions').update({ status: 'published' }).in('id', batch);
  expect(error, error?.message).toBeNull();
}

beforeAll(async () => {
  ({ db: admin } = await signedIn('admin@kirtanplayer.com'));
  ({ db: contributor, id: contributorId } = await signedIn('contributor@kirtanplayer.com'));

  const start = await fetchStanding(contributor, contributorId);
  expect(start.trust, 'the seed contributor must be a contributor').toBe('contributor');
  // Earlier work counts too; the walk needs room to stop one short.
  expect(start.published, 'the seed contributor is already near the threshold').toBeLessThan(
    TRUSTED_AT - 1
  );
  before = start;

  const { data: track } = await admin
    .from('tracks')
    .select('id')
    .is('missing_since', null)
    .order('id')
    .limit(1)
    .single();
  const need = TRUSTED_AT - start.published;
  const { data, error } = await contributor
    .from('renditions')
    .insert(
      Array.from({ length: need }, (_, i) => ({
        track_id: track!.id,
        start_sec: i * 60,
        end_sec: i * 60 + 60,
        name: `${TAG} ${i}`,
        ...LINKED,
        created_by: contributorId,
      }))
    )
    .select('id');
  expect(error, error?.message).toBeNull();
  ids = data!.map((r) => r.id);
});

afterAll(async () => {
  if (!admin || !contributor) return;
  await admin.from('renditions').delete().like('name', `${TAG}%`);
  const { data } = await admin.from('profiles').select('trust').eq('id', contributorId).single();
  if (data?.trust !== 'contributor') {
    await admin.rpc('set_trust', { target: contributorId, level: 'contributor' });
  }
  const left = await admin.from('renditions').select('id').like('name', `${TAG}%`);
  expect(left.data, 'fixture renditions left behind').toEqual([]);
});

it('counts a draft as pending, and a publish moves it across', async () => {
  const drafts = ids.length;
  const s = await fetchStanding(contributor, contributorId);
  expect(s).toEqual({
    trust: 'contributor',
    published: before.published,
    pending: before.pending + drafts,
  });

  await publish(1);
  const after = await fetchStanding(contributor, contributorId);
  expect(after.published).toBe(before.published + 1);
  expect(after.pending).toBe(before.pending + drafts - 1);
});

it('one short of the threshold is still a contributor', async () => {
  await publish(ids.length - 1);
  const s = await fetchStanding(contributor, contributorId);
  expect(s.published).toBe(TRUSTED_AT - 1);
  expect(s.trust).toBe('contributor');
});

it('the publish that makes the threshold promotes to trusted', async () => {
  await publish(1);
  const s = await fetchStanding(contributor, contributorId);
  expect(s.published).toBe(TRUSTED_AT);
  expect(s.trust).toBe('trusted');
  // And the matrix agrees: trusted publishes its own work.
  const { data } = await contributor.rpc('authorize', { requested: 'renditions.publish' });
  expect(data).toBe(true);
});
