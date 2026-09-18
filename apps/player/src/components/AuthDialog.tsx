/**
 * Sign in / sign up, in one dialog.
 *
 * A dialog rather than a `/signin` route because auth here is contextual: it is
 * always reached from something the listener was already doing ("save this",
 * "add to a playlist"), and a route change would lose that place. Mounted once
 * in the shell; anything opens it through `useSession().prompt()`.
 */
import { signInWithPassword, signUp } from '@kp/api';
import { Button } from '@kp/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@kp/ui/dialog';
import { Input } from '@kp/ui/input';
import { Label } from '@kp/ui/label';
import { useEffect, useState, type FormEvent } from 'react';

import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';

export function AuthDialog() {
  const { promptOpen, closePrompt } = useSession();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  // Every open starts clean — a stale error from a mistyped password last time
  // is confusing, and a lingering password in a field is worse.
  useEffect(() => {
    if (!promptOpen) return;
    setMode('signin');
    setEmail('');
    setPassword('');
    setMessage('');
  }, [promptOpen]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setMessage('');

    if (!email.trim() || !password) {
      setMessage('Enter your email and a password.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await signInWithPassword(supabase, email.trim(), password);
        if (error) setMessage(error.message);
        else closePrompt();
      } else {
        const result = await signUp(supabase, email.trim(), password);
        if (result.error) setMessage(result.error);
        else if (result.confirm) setMessage('Check your email to confirm the account.');
        else closePrompt();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={promptOpen} onOpenChange={(open) => (open ? null : closePrompt())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === 'signin' ? 'Sign in' : 'Create an account'}</DialogTitle>
          <DialogDescription>
            Listening never needs an account. This is only so your saves follow you.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="auth-password">Password</Label>
            <Input
              id="auth-password"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {message ? (
            <p role="alert" className="text-sm text-muted-foreground">
              {message}
            </p>
          ) : null}

          <Button type="submit" disabled={busy}>
            {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </Button>

          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setMessage('');
            }}
          >
            {mode === 'signin'
              ? 'No account yet? Create one.'
              : 'Already have an account? Sign in.'}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
