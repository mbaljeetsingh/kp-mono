import { createClient, PostgrestError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { guardFetch, toError, type AuthWatch } from './client';

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
  it('turns what a real failed query hands back into an Error, message and code kept', async () => {
    // A real client behind the guard, refusing as it does while a sign-in
    // renews: the whole path from the 401 to what an @kp/api function throws.
    const watch: AuthWatch = { signedIn: true, trouble: 0 };
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: guardFetch(watch, { url, key, tokenless: 'refuse' }, vi.fn()) },
    });
    const { error } = await client.from('renditions').select('id');
    // What postgrest-js returns without throwOnError: not an Error at all,
    // which is why every page showed "Failed".
    expect(error).not.toBeInstanceOf(Error);

    const thrown = toError(error!);
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.message).toBe('Your sign-in is being renewed. Try again in a moment.');
    expect((thrown as PostgrestError).code).toBe('PGRST301');
  });

  it('leaves an Error as it is', () => {
    const error = new PostgrestError({ message: 'm', details: 'd', hint: 'h', code: 'c' });
    expect(toError(error)).toBe(error);
  });
});
