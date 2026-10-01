import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { setRenditionStatus } from './admin';
import { guardFetch, type AuthWatch } from './client';

// Any project URL: only the /auth/v1/ prefix built from it matters, and
// nothing here makes a request.
const url = 'https://project.supabase.co';
const key = 'sb_publishable_test';
const rest = `${url}/rest/v1/renditions?select=id`;

function setup(tokenless: 'send' | 'refuse', signedIn = true, status = 200) {
  const watch: AuthWatch = { signedIn, trouble: 0 };
  const base = vi.fn(async () => new Response('[]', { status }));
  return { watch, base, fetch: guardFetch(watch, { url, key, tokenless }, base) };
}

const as = (bearer: string) => ({ headers: new Headers({ Authorization: `Bearer ${bearer}` }) });

describe('guardFetch', () => {
  it("sends the signed-in user's own requests untouched", async () => {
    const { watch, base, fetch } = setup('refuse');
    const res = await fetch(rest, as('eyJ.user.jwt'));
    expect(res.status).toBe(200);
    expect(base).toHaveBeenCalledOnce();
    expect(watch.trouble).toBe(0);
  });

  it('refuses a request falling back to the publishable key while signed in', async () => {
    const { watch, base, fetch } = setup('refuse');
    const res = await fetch(rest, as(key));
    expect(res.status).toBe(401);
    expect(base).not.toHaveBeenCalled();
    expect(watch.trouble).toBe(1);
    // PostgREST's error shape, so the caller's message is readable.
    expect(((await res.json()) as { message: string }).message).toMatch(/renewed/);
  });

  it('sends it in send mode, but still counts it', async () => {
    const { watch, base, fetch } = setup('send');
    const res = await fetch(rest, as(key));
    expect(res.status).toBe(200);
    expect(base).toHaveBeenCalledOnce();
    expect(watch.trouble).toBe(1);
  });

  it('counts a request with no Authorization at all', async () => {
    const { watch, fetch } = setup('refuse');
    expect((await fetch(rest, {})).status).toBe(401);
    expect(watch.trouble).toBe(1);
  });

  it('leaves the publishable key alone when nobody is signed in', async () => {
    const { watch, base, fetch } = setup('refuse', false);
    expect((await fetch(rest, as(key))).status).toBe(200);
    expect(base).toHaveBeenCalledOnce();
    expect(watch.trouble).toBe(0);
  });

  it("never touches the auth client's own requests", async () => {
    const { watch, base, fetch } = setup('refuse');
    await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, as(key));
    expect(base).toHaveBeenCalledOnce();
    expect(watch.trouble).toBe(0);
  });

  it('counts a 401 on the user token (a token the server already calls expired)', async () => {
    const { watch, fetch } = setup('refuse', true, 401);
    expect((await fetch(rest, as('eyJ.user.jwt'))).status).toBe(401);
    expect(watch.trouble).toBe(1);
  });

  it('reads the URL off a Request or a URL too', async () => {
    const { watch, base, fetch } = setup('refuse');
    await fetch(new URL(`${url}/auth/v1/user`), as(key));
    await fetch(new Request(`${url}/auth/v1/user`), as(key));
    expect(base).toHaveBeenCalledTimes(2);
    expect(watch.trouble).toBe(0);
  });
});

describe('toError', () => {
  /** A real client whose every request gets `respond`'s answer. */
  const answering = (respond: () => Response) =>
    createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async () => respond() },
    });

  it('is what an @kp/api function throws: an Error with the message and code', async () => {
    // A real client behind the guard, refusing as it does while a sign-in
    // renews. The base answers, so a guard that stopped refusing fails here at
    // once rather than on postgrest-js's retries.
    const watch: AuthWatch = { signedIn: true, trouble: 0 };
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: guardFetch(watch, { url, key, tokenless: 'refuse' }, async () => new Response('[]')),
      },
    });
    // What postgrest-js hands back: not an Error, which is why every page
    // showed "Failed".
    const { error } = await client.from('renditions').select('id');
    expect(error).not.toBeInstanceOf(Error);

    // `toThrow` alone passes on any object with a message; the class is the point.
    const publishing = setRenditionStatus(client, 'r1', 'published');
    await expect(publishing).rejects.toBeInstanceOf(Error);
    await expect(publishing).rejects.toThrow(
      'Your sign-in is being renewed. Try again in a moment.'
    );
    await expect(publishing).rejects.toMatchObject({ code: 'PGRST301' });
  });

  it('puts a sentence in place of anything PostgREST did not write', async () => {
    // A gateway's empty 502 left every alert blank, its HTML page filled one,
    // and a dropped connection read "TypeError: Failed to fetch".
    const answers = [
      () => new Response('', { status: 502 }),
      () => new Response('<!DOCTYPE html><html><body>Bad gateway</body></html>', { status: 520 }),
      () => new Response('error code: 522', { status: 522 }),
      () => {
        throw new TypeError('Failed to fetch');
      },
    ];
    for (const answer of answers) {
      await expect(setRenditionStatus(answering(answer), 'r1', 'published')).rejects.toThrow(
        "Couldn't reach the server, or it didn't answer properly. Try again in a moment."
      );
    }
  });

  it('reads an expired token as the renewal it is', async () => {
    // A clock running behind sends a token the server already counts expired.
    const expired = () =>
      new Response(JSON.stringify({ code: 'PGRST303', message: 'JWT expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    await expect(setRenditionStatus(answering(expired), 'r1', 'published')).rejects.toThrow(
      'Your sign-in is being renewed. Try again in a moment.'
    );
  });
});
