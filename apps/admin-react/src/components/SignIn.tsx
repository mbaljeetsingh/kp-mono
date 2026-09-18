/**
 * Sign-in, which is the whole app until it succeeds.
 *
 * Shaped after Supabase UI's password-based-auth block, but on our own client:
 * theirs ships a `lib/supabase/client.ts` that reads NEXT_PUBLIC_ variables and
 * pulls in a Next-only path helper, and `@kp/api`'s client factory exists
 * precisely so Vite and Expo can each supply their own config. The primitives
 * underneath are the same shadcn ones.
 *
 * Every signed-in account is a contributor by design — the trust ladder gates
 * publishing, not participation — so this says what signing in gets you rather
 * than implying an approval step that does not exist.
 */
import { signInWithPassword } from '@kp/api';
import { Button } from '@kp/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kp/ui/card';
import { Input } from '@kp/ui/input';
import { Label } from '@kp/ui/label';
import { useState, type FormEvent } from 'react';

import { supabase } from '~/lib/supabase';

export function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: failure } = await signInWithPassword(supabase, email, password);
    if (failure) setError(failure.message);
    setBusy(false);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2">
            <img src="/brand/logo-badge-dark.svg" alt="" className="size-7" />
            <CardTitle>Contribute</CardTitle>
          </div>
          <CardDescription>
            Sign in to tag recordings. Anyone with an account can contribute — the trust
            ladder gates publishing, not participation.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {/* role="alert" so a screen reader hears the failure rather than
                finding it only on a re-read of the form. */}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
