/**
 * Possible duplicates against a real database: the `tracks!inner` filter that a
 * stubbed client cannot exercise (without `!inner`, every ragi's tags come back),
 * and RLS deciding whose drafts are in the answer.
 *
 * Same rules as permissions.db.test.ts: local stack only, the seed accounts,
 * every row tagged with this run and removed in afterAll, no source='scan' rows.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, inject, it } from 'vitest';

import { listRepeats } from './admin';
import { toError, type KpClient } from './client';

// Local seed accounts only (supabase/seed.sql). Never real credentials.
const PASSWORD = 'password';
const TAG = `kp-repeats-${Date.now().toString(36)}`;
// No real shabad has this id, so nothing else in the database can match it.
const SHABAD = 999_000_000 + Math.floor(Math.random() * 100_000);

async function signedIn(email: string): Promise<SupabaseClient> {
  const db = createClient(inject('supabaseUrl'), inject('supabaseKey'), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `kp-repeats-${email}`,
    },
  });
  const { error } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (error)
    throw new Error(`Could not sign in as ${email} (is the seed loaded?): ${error.message}`);
  return db;
}

let admin: SupabaseClient;
let contributor: SupabaseClient;
let adminId: string;
let here: string;
let sameRagi: string;
let otherRagi: string;
let ragi: string;

beforeAll(async () => {
  admin = await signedIn('admin@kirtanplayer.com');
  contributor = await signedIn('contributor@kirtanplayer.com');
  adminId = (await admin.auth.getUser()).data.user?.id ?? '';

  const { data, error } = await admin
    .from('tracks')
    .select('id,artist_dir')
    .not('artist_dir', 'is', null)
    .limit(500);
  if (error) throw toError(error);
  const rows = (data ?? []) as { id: string; artist_dir: string }[];
  const counts = new Map<string, number>();
  for (const t of rows) counts.set(t.artist_dir, (counts.get(t.artist_dir) ?? 0) + 1);
  const twice = [...counts].find(([, n]) => n > 1)?.[0];
  const other = rows.find((t) => t.artist_dir !== twice);
  if (!twice || !other) throw new Error('The seed needs two recordings by one ragi and another');
  ragi = twice;
  const mine = rows.filter((t) => t.artist_dir === twice);
  here = mine[0]?.id ?? '';
  sameRagi = mine[1]?.id ?? '';
  otherRagi = other.id;

  const row = (track_id: string, start_sec: number) => ({
    track_id,
    start_sec,
    end_sec: start_sec + 60,
    name: TAG,
    shabad_id: SHABAD,
    line_timings: [],
    created_by: adminId,
  });
  const { error: insert } = await admin
    .from('renditions')
    .insert([row(here, 100), row(sameRagi, 200), row(otherRagi, 300)]);
  if (insert) throw toError(insert);
});

afterAll(async () => {
  await admin?.from('renditions').delete().eq('name', TAG);
});

it('finds this ragi in other recordings, not this recording or another ragi', async () => {
  const rows = await listRepeats(admin as unknown as KpClient, [SHABAD], ragi, here);
  expect(rows.map((r) => r.track_id)).toEqual([sameRagi]);
  expect(rows[0]?.start_sec).toBe(200);
});

it('leaves out someone else’s draft for a contributor', async () => {
  const rows = await listRepeats(contributor as unknown as KpClient, [SHABAD], ragi, here);
  expect(rows).toEqual([]);
});
