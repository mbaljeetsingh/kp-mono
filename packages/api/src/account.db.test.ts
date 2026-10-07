/**
 * Deleting your own account (delete_own_account), end to end.
 *
 * Both stores reject an app whose account deletion is broken, and the way it
 * breaks is silent and destructive: one foreign key on cascade instead of set
 * null and deleting an account deletes the archive timings that person tagged.
 * Only the real FKs can show that, so this signs up a throwaway account, gives
 * it something personal (a favorite, a playlist) and something shared (a
 * draft and a published rendition — the set null fires the renditions
 * triggers, and a published row is where one of them could refuse), deletes
 * it, and checks which survived.
 *
 * Same rules as permissions.db.test.ts: local stack only, every row tagged
 * with this run and removed in afterAll. The seed accounts are only ever
 * signed in as — the one call that would delete one (the admin's) is the
 * refusal under test, and it checks first that it will be refused.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, inject, it } from 'vitest';

import { deleteOwnAccount } from './auth';

const PASSWORD = 'password';
const TAG = `kp-delete-${Date.now().toString(36)}`;

function client(storageKey: string): SupabaseClient {
  return createClient(inject('supabaseUrl'), inject('supabaseKey'), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey,
    },
  });
}

let admin: SupabaseClient;
let adminId: string;
let leaver: SupabaseClient;
let leaverId: string;

/**
 * Publishing needs a shabad and its main verse; an empty timing list keeps the
 * row out of align's queue, so the dispatch trigger has nothing to start (as
 * in standing.db.test.ts).
 */
const LINKED = { shabad_id: 1, main_verse_id: 1, line_timings: [] };
const email = `${TAG}@example.test`;

beforeAll(async () => {
  admin = client(`${TAG}-admin`);
  const signedIn = await admin.auth.signInWithPassword({
    email: 'admin@kirtanplayer.com',
    password: PASSWORD,
  });
  if (signedIn.error || !signedIn.data.user) {
    throw new Error(`Could not sign in as the seed admin: ${signedIn.error?.message}`);
  }
  adminId = signedIn.data.user.id;

  // Confirmations are off locally (config.toml), so signup returns a session.
  leaver = client(`${TAG}-leaver`);
  const { data, error } = await leaver.auth.signUp({ email, password: PASSWORD });
  if (error || !data.user || !data.session) {
    throw new Error(`Could not sign up a throwaway account: ${error?.message}`);
  }
  leaverId = data.user.id;
});

afterAll(async () => {
  if (!admin) return;
  await admin.from('renditions').delete().like('name', `${TAG}%`);
  const left = await admin.from('renditions').select('id').like('name', `${TAG}%`);
  expect(left.data, 'fixture renditions left behind').toEqual([]);
});

it('cannot be called signed out', async () => {
  const anon = client(`${TAG}-anon`);
  const { error } = await anon.rpc('delete_own_account');
  expect(error, 'anon has no grant').not.toBeNull();
});

it('refuses the only admin', async () => {
  const admins = await admin.from('profiles').select('id').eq('trust', 'admin');
  // Were there a second admin this call would really delete the seed admin.
  expect(admins.data, 'this test needs exactly one admin').toEqual([{ id: adminId }]);
  const { error } = await deleteOwnAccount(admin);
  expect(error).toMatch(/only admin/);
  const still = await admin.from('profiles').select('id').eq('id', adminId).single();
  expect(still.data?.id).toBe(adminId);
});

it('takes the personal things and keeps the shared work, author removed', async () => {
  const { data: track } = await admin
    .from('tracks')
    .select('id')
    .is('missing_since', null)
    .order('id')
    .limit(1)
    .single();
  const draft = await leaver
    .from('renditions')
    .insert({
      track_id: track!.id,
      start_sec: 0,
      end_sec: 60,
      name: `${TAG} draft`,
      created_by: leaverId,
    })
    .select('id')
    .single();
  expect(draft.error, draft.error?.message).toBeNull();
  const work = await leaver
    .from('renditions')
    .insert({
      track_id: track!.id,
      start_sec: 60,
      end_sec: 120,
      name: `${TAG} published`,
      ...LINKED,
      created_by: leaverId,
    })
    .select('id')
    .single();
  expect(work.error, work.error?.message).toBeNull();
  const pub = await admin
    .from('renditions')
    .update({ status: 'published' })
    .eq('id', work.data!.id);
  expect(pub.error, pub.error?.message).toBeNull();

  const { data: published } = await admin
    .from('renditions')
    .select('id')
    .eq('status', 'published')
    .limit(1)
    .single();
  const fav = await leaver
    .from('favorites')
    .insert({ user_id: leaverId, rendition_id: published!.id });
  expect(fav.error, fav.error?.message).toBeNull();
  const list = await leaver.from('playlists').insert({ user_id: leaverId, name: TAG });
  expect(list.error, list.error?.message).toBeNull();

  expect(await deleteOwnAccount(leaver)).toEqual({});

  // The draft survives, nobody's now.
  const kept = await admin
    .from('renditions')
    .select('id, created_by')
    .eq('id', draft.data!.id)
    .single();
  expect(kept.data).toEqual({ id: draft.data!.id, created_by: null });
  // And the published work stays published — still in the player.
  const live = await admin
    .from('renditions')
    .select('status, created_by')
    .eq('id', work.data!.id)
    .single();
  expect(live.data).toEqual({ status: 'published', created_by: null });

  // The profile is gone — and with it, by cascade, the favorite and the
  // playlist (a key that did not cascade would have failed the delete).
  const profile = await admin.from('profiles').select('id').eq('id', leaverId);
  expect(profile.data).toEqual([]);

  // And the account itself: the same email and password no longer sign in.
  const again = await client(`${TAG}-again`).auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  expect(again.error).not.toBeNull();
});
