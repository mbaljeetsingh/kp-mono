/**
 * The permission matrix, asked of the real database through the real API.
 *
 * Any signed-in contributor could once PATCH their own profile to
 * trust='admin' and then publish, edit and delete everything (#3; the fix is
 * the column-level grant in 20260804000300_authz.sql). It survived several
 * commits because the only end-to-end check exercised the happy path — admin
 * doing admin things, contributor doing contributor things — and never asked
 * whether a contributor could do admin things.
 *
 * So every row here is asked in both directions: the actor who must be refused
 * is refused, AND the actor who must be allowed still is. A denial alone
 * proves nothing — a broken fixture, a typo in a column, a stack that is down
 * all "deny" too.
 *
 * How a refusal looks depends on which layer refuses, and each is asserted as
 * what it is:
 *   - a missing GRANT, or a WITH CHECK that fails: error 42501;
 *   - a USING clause that hides the row: no error, zero rows — so every such
 *     case also re-reads the row to show it did not change;
 *   - a definer function's own guard (set_trust, set_role_permission): P0001.
 *
 * Runs against the local stack only (vitest.db.config.ts), as the seed
 * accounts. Every row it writes carries this run's tag and is removed in
 * afterAll; nothing it creates fires a trigger that writes somewhere it
 * cannot clean (no source='scan' rows, whose deletion records a rejection).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    supabaseUrl: string;
    supabaseKey: string;
  }
}

// Local seed accounts only (supabase/seed.sql). Never real credentials.
const ADMIN = 'admin@kirtanplayer.com';
const CONTRIBUTOR = 'contributor@kirtanplayer.com';
const PASSWORD = 'password';

const TAG = `kp-matrix-${Date.now().toString(36)}`;

type Result = { data: unknown; error: { code?: string; message: string } | null };

function client(name: string): SupabaseClient {
  return createClient(inject('supabaseUrl'), inject('supabaseKey'), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `kp-matrix-${name}`,
    },
  });
}

async function signedIn(email: string): Promise<{ db: SupabaseClient; id: string }> {
  const db = client(email);
  const { data, error } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.user) {
    throw new Error(`Could not sign in as ${email} (is the seed loaded?): ${error?.message}`);
  }
  return { db, id: data.user.id };
}

/** Refused by a grant or a WITH CHECK. */
function refused(res: Result) {
  expect(res.error, 'expected a refusal').not.toBeNull();
  expect(res.error?.code).toBe('42501');
}

/** Refused by a definer function's own guard. */
function raised(res: Result, message: RegExp) {
  expect(res.error, 'expected the function to refuse').not.toBeNull();
  expect(res.error?.code).toBe('P0001');
  expect(res.error?.message).toMatch(message);
}

/** Allowed, and touched exactly `n` rows. */
function allowed(res: Result, n?: number) {
  expect(res.error, res.error?.message).toBeNull();
  if (n !== undefined) expect(res.data).toHaveLength(n);
}

/** Hidden by a USING clause: no error, nothing touched. */
function hidden(res: Result) {
  expect(res.error, res.error?.message).toBeNull();
  expect(res.data).toEqual([]);
}

let anon: SupabaseClient;
let admin: SupabaseClient;
let contributor: SupabaseClient;
let adminId: string;
let contributorId: string;
let trackId: string;
let originalName: string | null;

// Fixture renditions, all on `trackId`, all named with TAG.
let published: string; // admin's, published
let draft: string; // contributor's, stays a draft throughout
let toPublish: string; // contributor's, published by the admin below

async function trustOf(id: string): Promise<string | undefined> {
  const { data } = await admin.from('profiles').select('trust').eq('id', id).single();
  return data?.trust;
}

async function rendition(id: string) {
  const { data } = await admin.from('renditions').select('*').eq('id', id).single();
  return data;
}

beforeAll(async () => {
  anon = client('anon');
  ({ db: admin, id: adminId } = await signedIn(ADMIN));
  ({ db: contributor, id: contributorId } = await signedIn(CONTRIBUTOR));

  // The matrix means nothing if the seed accounts are not what it assumes.
  expect(await trustOf(adminId)).toBe('admin');
  const own = await contributor
    .from('profiles')
    .select('trust, display_name')
    .eq('id', contributorId)
    .single();
  expect(own.data?.trust, 'the seed contributor must be a contributor').toBe('contributor');
  originalName = own.data?.display_name ?? null;

  // A recording nobody has queued or marked done, so the scan-queue and
  // mark-done rows can be added and removed without touching real state.
  const [{ data: tracks }, { data: queued }] = await Promise.all([
    anon
      .from('tracks')
      .select('id')
      .is('tagged_done_at', null)
      // The shabads view hides renditions on a recording gone from sgpc.net.
      .is('missing_since', null)
      .order('id')
      .limit(100),
    admin.from('scan_requests').select('track_id'),
  ]);
  const busy = new Set((queued ?? []).map((q) => q.track_id));
  const free = (tracks ?? []).find((t) => !busy.has(t.id));
  if (!free) throw new Error('No unqueued track to use as a fixture.');
  trackId = free.id;

  const row = (name: string, extra: object = {}) => ({
    track_id: trackId,
    start_sec: 0,
    end_sec: 60,
    name: `${TAG} ${name}`,
    // An artist nothing else has, so the public aggregates can be asked
    // whether a draft leaks into them.
    artist: TAG,
    // No shabad: a published rendition with one queues alignment, and the
    // dispatch trigger would try to start a workflow.
    shabad_id: null,
    ...extra,
  });

  const a = await admin
    .from('renditions')
    .insert(row('published', { status: 'published', created_by: adminId }))
    .select('id')
    .single();
  allowed(a);
  published = a.data!.id;

  const c = await contributor
    .from('renditions')
    .insert([
      row('draft', { created_by: contributorId }),
      row('to publish', { created_by: contributorId }),
    ])
    .select('id, name');
  allowed(c, 2);
  draft = c.data!.find((r) => r.name.endsWith(' draft'))!.id;
  toPublish = c.data!.find((r) => r.name.endsWith(' to publish'))!.id;
});

afterAll(async () => {
  // Best effort and in this order, so one failure does not strand the rest.
  // admin and contributor are unset only if sign-in itself failed.
  if (!admin || !contributor) return;
  await contributor.from('playlists').delete().like('name', `${TAG}%`);
  await contributor
    .from('favorites')
    .delete()
    .eq('rendition_id', published ?? '');
  await admin.from('renditions').delete().like('name', `${TAG}%`);
  if (trackId) {
    await admin.from('scan_requests').delete().eq('track_id', trackId).is('requested_by', null);
    await admin
      .from('tracks')
      .update({ tagged_done_at: null, tagged_done_by: null })
      .eq('id', trackId)
      .eq('tagged_done_by', adminId);
  }
  await contributor.from('profiles').update({ display_name: originalName }).eq('id', contributorId);
  // Publishing their work can promote a contributor (maybe_promote), and the
  // set_trust row moves them on purpose. Either way, put them back.
  if ((await trustOf(contributorId)) !== 'contributor') {
    await admin.rpc('set_trust', { target: contributorId, level: 'contributor' });
  }

  const left = await admin.from('renditions').select('id').like('name', `${TAG}%`);
  expect(left.data, 'fixture renditions left behind').toEqual([]);
  expect(await trustOf(contributorId)).toBe('contributor');
});

describe('escalating your own trust', () => {
  it('a contributor cannot PATCH their own trust', async () => {
    refused(await contributor.from('profiles').update({ trust: 'admin' }).eq('id', contributorId));
    expect(await trustOf(contributorId)).toBe('contributor');
  });

  it('nor can an admin: trust moves only through set_trust', async () => {
    refused(await admin.from('profiles').update({ trust: 'reviewer' }).eq('id', adminId));
    expect(await trustOf(adminId)).toBe('admin');
  });

  it('a contributor can still edit their own display name', async () => {
    allowed(
      await contributor
        .from('profiles')
        .update({ display_name: `${TAG} name` })
        .eq('id', contributorId)
        .select('id'),
      1
    );
  });

  it("nobody edits someone else's profile, admin included", async () => {
    hidden(
      await admin
        .from('profiles')
        .update({ display_name: 'renamed by admin' })
        .eq('id', contributorId)
        .select('id')
    );
  });

  it('profiles are private: own row, or every row with users.manage', async () => {
    hidden(await contributor.from('profiles').select('id').eq('id', adminId));
    allowed(await admin.from('profiles').select('id').eq('id', contributorId), 1);
    refused(await anon.from('profiles').select('id'));
  });
});

describe('set_trust', () => {
  it('a contributor cannot promote themselves', async () => {
    raised(
      await contributor.rpc('set_trust', { target: contributorId, level: 'admin' }),
      /not permitted/
    );
    expect(await trustOf(contributorId)).toBe('contributor');
  });

  it('a contributor cannot demote an admin', async () => {
    raised(
      await contributor.rpc('set_trust', { target: adminId, level: 'blocked' }),
      /not permitted/
    );
    expect(await trustOf(adminId)).toBe('admin');
  });

  it('anon cannot call it at all', async () => {
    const res = await anon.rpc('set_trust', { target: contributorId, level: 'admin' });
    expect(res.error).not.toBeNull();
    expect(await trustOf(contributorId)).toBe('contributor');
  });

  it('an admin cannot change their own trust', async () => {
    raised(await admin.rpc('set_trust', { target: adminId, level: 'contributor' }), /own account/);
    expect(await trustOf(adminId)).toBe('admin');
  });

  it("an admin can change someone else's", async () => {
    try {
      allowed(await admin.rpc('set_trust', { target: contributorId, level: 'trusted' }));
      expect(await trustOf(contributorId)).toBe('trusted');
    } finally {
      await admin.rpc('set_trust', { target: contributorId, level: 'contributor' });
    }
    expect(await trustOf(contributorId)).toBe('contributor');
  });
});

describe('the role permission matrix itself', () => {
  it('authorize answers per role', async () => {
    expect((await contributor.rpc('authorize', { requested: 'renditions.propose' })).data).toBe(
      true
    );
    expect((await contributor.rpc('authorize', { requested: 'renditions.publish' })).data).toBe(
      false
    );
    expect((await contributor.rpc('authorize', { requested: 'users.manage' })).data).toBe(false);
    expect((await admin.rpc('authorize', { requested: 'renditions.publish' })).data).toBe(true);
    expect((await admin.rpc('authorize', { requested: 'users.manage' })).data).toBe(true);
  });

  it('a contributor cannot grant their role a permission', async () => {
    raised(
      await contributor.rpc('set_role_permission', {
        target_role: 'contributor',
        target_permission: 'renditions.publish',
        enabled: true,
      }),
      /not permitted/
    );
    expect((await contributor.rpc('authorize', { requested: 'renditions.publish' })).data).toBe(
      false
    );
  });

  it('nobody writes role_permissions directly, admin included', async () => {
    refused(
      await contributor
        .from('role_permissions')
        .insert({ role: 'contributor', permission: 'renditions.publish' })
    );
    refused(
      await admin
        .from('role_permissions')
        .insert({ role: 'contributor', permission: 'renditions.publish' })
    );
  });

  it('an admin can call set_role_permission, but cannot lock admins out', async () => {
    // Granting what admin already holds: the allowed path, with no change.
    // Not users.manage — the lock-out guard refuses that pair either way.
    allowed(
      await admin.rpc('set_role_permission', {
        target_role: 'admin',
        target_permission: 'renditions.publish',
        enabled: true,
      })
    );
    raised(
      await admin.rpc('set_role_permission', {
        target_role: 'admin',
        target_permission: 'users.manage',
        enabled: false,
      }),
      /must retain/
    );
  });
});

describe('inserting a published rendition', () => {
  const row = (extra: object) => ({
    track_id: trackId,
    start_sec: 60,
    end_sec: 120,
    name: `${TAG} insert`,
    ...extra,
  });

  it('a contributor cannot', async () => {
    refused(
      await contributor
        .from('renditions')
        .insert(row({ status: 'published', created_by: contributorId }))
    );
  });

  it('a contributor can insert a draft (beforeAll did), but not in anyone else’s name', async () => {
    expect((await rendition(draft))?.status).toBe('draft');
    refused(await contributor.from('renditions').insert(row({ created_by: adminId })));
  });

  it('anon cannot insert anything', async () => {
    refused(await anon.from('renditions').insert(row({})));
  });

  it('an admin can (beforeAll did)', async () => {
    const r = await rendition(published);
    expect(r?.status).toBe('published');
    expect(r?.created_by).toBe(adminId);
  });
});

describe('publishing through UPDATE', () => {
  it('a contributor can revise their own draft', async () => {
    allowed(
      await contributor
        .from('renditions')
        .update({ name: `${TAG} to publish (revised)` })
        .eq('id', toPublish)
        .select('id'),
      1
    );
  });

  it('but cannot publish it', async () => {
    refused(
      await contributor.from('renditions').update({ status: 'published' }).eq('id', toPublish)
    );
    expect((await rendition(toPublish))?.status).toBe('draft');
  });

  it('nor hand it to someone else', async () => {
    refused(
      await contributor.from('renditions').update({ created_by: adminId }).eq('id', toPublish)
    );
    expect((await rendition(toPublish))?.created_by).toBe(contributorId);
  });

  it("cannot touch someone else's published rendition", async () => {
    hidden(
      await contributor
        .from('renditions')
        .update({ name: 'vandalised' })
        .eq('id', published)
        .select('id')
    );
    expect((await rendition(published))?.name).toBe(`${TAG} published`);
  });

  it('cannot delete, even their own draft', async () => {
    hidden(await contributor.from('renditions').delete().eq('id', draft).select('id'));
    expect(await rendition(draft)).not.toBeNull();
  });

  it("an admin can publish a contributor's draft", async () => {
    allowed(
      await admin
        .from('renditions')
        .update({ status: 'published' })
        .eq('id', toPublish)
        .select('id'),
      1
    );
    expect((await rendition(toPublish))?.status).toBe('published');
  });

  it('and once it is published, its author can no longer edit it', async () => {
    hidden(
      await contributor
        .from('renditions')
        .update({ status: 'draft' })
        .eq('id', toPublish)
        .select('id')
    );
    expect((await rendition(toPublish))?.status).toBe('published');
  });
});

describe('anon reading drafts', () => {
  it('anon sees no unpublished rendition at all', async () => {
    hidden(await anon.from('renditions').select('id').eq('id', draft));
    hidden(await anon.from('renditions').select('id').neq('status', 'published').limit(1));
  });

  it('but does see published ones', async () => {
    allowed(await anon.from('renditions').select('id').eq('id', published), 1);
  });

  it('the shabads view shows anon the published fixture and not the draft', async () => {
    const res = await anon.from('shabads').select('id').eq('artist', TAG);
    allowed(res);
    const ids = (res.data ?? []).map((r) => r.id).sort();
    expect(ids).toEqual([published, toPublish].sort());
  });

  it('the public aggregates count published work only', async () => {
    // Three fixtures carry this artist; the draft must not be counted.
    const counts = await anon.rpc('artist_counts');
    allowed(counts);
    const mine = (counts.data as { artist: string; shabads: number }[]).find(
      (r) => r.artist === TAG
    );
    expect(mine?.shabads).toBe(2);
  });

  it('register_play counts published plays and ignores drafts', async () => {
    allowed(await anon.rpc('register_play', { rendition: draft }));
    allowed(await anon.rpc('register_play', { rendition: published }));
    expect((await rendition(draft))?.play_count).toBe(0);
    expect((await rendition(published))?.play_count).toBe(1);
  });

  it('the author and a reviewer can read the draft', async () => {
    allowed(await contributor.from('renditions').select('id').eq('id', draft), 1);
    allowed(await admin.from('renditions').select('id').eq('id', draft), 1);
  });

  it('anon cannot read the tagging surfaces', async () => {
    refused(await anon.from('recordings').select('id').limit(1));
    refused(await anon.from('scan_requests').select('track_id').limit(1));
    refused(await anon.from('scan_rejections').select('id').limit(1));
  });
});

describe('the scan queue', () => {
  it('a contributor can read the queue but not add to it', async () => {
    allowed(await contributor.from('scan_requests').select('track_id').limit(1));
    refused(await contributor.from('scan_requests').insert({ track_id: trackId }));
  });

  it('an admin can add to it; only a reviewer can remove from it', async () => {
    // requested_by null: the dispatch trigger starts a run only for a request
    // somebody made, and this one must not even try.
    allowed(
      await admin
        .from('scan_requests')
        .insert({ track_id: trackId, requested_by: null })
        .select('track_id'),
      1
    );
    hidden(
      await contributor.from('scan_requests').delete().eq('track_id', trackId).select('track_id')
    );
    allowed(
      await admin.from('scan_requests').delete().eq('track_id', trackId).select('track_id'),
      1
    );
  });

  it('scan_rejections is closed to every API role, admin included', async () => {
    refused(await contributor.from('scan_rejections').select('id').limit(1));
    refused(await admin.from('scan_rejections').select('id').limit(1));
  });
});

describe('marking a recording done', () => {
  it('a contributor cannot', async () => {
    hidden(
      await contributor
        .from('tracks')
        .update({ tagged_done_at: new Date().toISOString(), tagged_done_by: contributorId })
        .eq('id', trackId)
        .select('id')
    );
    const { data } = await anon.from('tracks').select('tagged_done_at').eq('id', trackId).single();
    expect(data?.tagged_done_at).toBeNull();
  });

  it('and no other column of the catalogue is writable', async () => {
    refused(await contributor.from('tracks').update({ title: 'renamed' }).eq('id', trackId));
    refused(await admin.from('tracks').update({ title: 'renamed' }).eq('id', trackId));
  });

  it('an admin can, in their own name only', async () => {
    const now = new Date().toISOString();
    refused(
      await admin
        .from('tracks')
        .update({ tagged_done_at: now, tagged_done_by: contributorId })
        .eq('id', trackId)
    );
    try {
      allowed(
        await admin
          .from('tracks')
          .update({ tagged_done_at: now, tagged_done_by: adminId })
          .eq('id', trackId)
          .select('id'),
        1
      );
    } finally {
      await admin
        .from('tracks')
        .update({ tagged_done_at: null, tagged_done_by: null })
        .eq('id', trackId);
    }
  });
});

describe('playlists and favorites are private to their owner', () => {
  let playlist: string;

  it('the owner can create a playlist and add to it', async () => {
    const p = await contributor
      .from('playlists')
      .insert({ user_id: contributorId, name: `${TAG} playlist` })
      .select('id')
      .single();
    allowed(p);
    playlist = p.data!.id;
    allowed(
      await contributor
        .from('playlist_items')
        .insert({ playlist_id: playlist, rendition_id: published })
        .select('playlist_id'),
      1
    );
  });

  it('nobody else can read, rename or add to it, admin included', async () => {
    hidden(await admin.from('playlists').select('id').eq('id', playlist));
    hidden(await admin.from('playlist_items').select('playlist_id').eq('playlist_id', playlist));
    hidden(await admin.from('playlists').update({ name: 'taken' }).eq('id', playlist).select('id'));
    refused(
      await admin.from('playlist_items').insert({ playlist_id: playlist, rendition_id: published })
    );
    refused(await anon.from('playlists').select('id').limit(1));
  });

  it("nobody creates a playlist in someone else's name", async () => {
    refused(
      await admin.from('playlists').insert({ user_id: contributorId, name: `${TAG} forged` })
    );
  });

  it('favorites: your own, and only your own', async () => {
    refused(
      await contributor.from('favorites').insert({ user_id: adminId, rendition_id: published })
    );
    allowed(
      await contributor
        .from('favorites')
        .insert({ user_id: contributorId, rendition_id: published })
        .select('rendition_id'),
      1
    );
    hidden(await admin.from('favorites').select('rendition_id').eq('user_id', contributorId));
    refused(await anon.from('favorites').select('rendition_id').limit(1));
  });

  it('the owner can delete their playlist', async () => {
    allowed(await contributor.from('playlists').delete().eq('id', playlist).select('id'), 1);
  });
});
