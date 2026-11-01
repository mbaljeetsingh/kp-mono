/**
 * recent_plays against the real policies: a listener can record and move their
 * own plays, and nobody else can read them. The upsert is the point, since moving
 * played_at on a second play needs an update grant and policy favorites never had.
 *
 * Local stack only, as permissions.db.test.ts is, and seed accounts only ever
 * signed in as. Unlike that file it leaves one row behind, parked at the epoch:
 * listeners have no delete grant, so there is no way to remove it from here.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, inject, it } from 'vitest';

function client(storageKey: string): SupabaseClient {
  return createClient(inject('supabaseUrl'), inject('supabaseKey'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey },
  });
}

const me = client('recent-me');
const other = client('recent-other');
const anon = client('recent-anon');
let myId: string;
let renditionId: string;

beforeAll(async () => {
  const signedIn = await me.auth.signInWithPassword({
    email: 'contributor@kirtanplayer.com',
    password: 'password',
  });
  myId = signedIn.data.user!.id;
  await other.auth.signInWithPassword({ email: 'admin@kirtanplayer.com', password: 'password' });
  const { data } = await anon.from('shabads').select('id').limit(1).single();
  renditionId = (data as { id: string }).id;
});

afterAll(async () => {
  // No delete grant by design, so the row goes the way a real one does: with
  // nothing to remove it but the account. Moved to the epoch to leave no mark.
  await me
    .from('recent_plays')
    .upsert({ user_id: myId, rendition_id: renditionId, played_at: new Date(0).toISOString() });
});

it('records a play, and moves it when played again', async () => {
  const row = { user_id: myId, rendition_id: renditionId };
  const first = await me.from('recent_plays').upsert({ ...row, played_at: '2026-01-01T00:00:00Z' });
  expect(first.error).toBeNull();
  const second = await me
    .from('recent_plays')
    .upsert({ ...row, played_at: '2026-01-02T00:00:00Z' });
  expect(second.error).toBeNull();

  const { data } = await me
    .from('recent_plays')
    .select('played_at')
    .eq('rendition_id', renditionId);
  expect(data).toHaveLength(1);
  expect(new Date((data![0] as { played_at: string }).played_at).toISOString()).toBe(
    '2026-01-02T00:00:00.000Z'
  );
});

it("keeps them from anybody else, and refuses a write in someone else's name", async () => {
  const seen = await other.from('recent_plays').select('rendition_id').eq('user_id', myId);
  expect(seen.data).toEqual([]);
  const written = await other
    .from('recent_plays')
    .upsert({ user_id: myId, rendition_id: renditionId });
  expect(written.error).not.toBeNull();
  const guest = await anon.from('recent_plays').select('rendition_id');
  expect(guest.error).not.toBeNull();
});
