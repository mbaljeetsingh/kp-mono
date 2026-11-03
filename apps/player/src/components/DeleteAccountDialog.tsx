/**
 * The web's way to delete an account, which until now only the phone had.
 *
 * The same words as the phone's alert, and the same single confirmation: a
 * dialog rather than an undo, because nothing brings it back. It stays open on
 * a refusal (the last admin cannot leave) so the reason is read where it was
 * asked; on success the session ends and the menu that opened it goes with it.
 */
import { deleteOwnAccount } from '@kp/api';
import { Button } from '@kp/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kp/ui/dialog';
import { useState } from 'react';
import { toast } from 'sonner';

import { supabase } from '~/lib/supabase';

export function DeleteAccountDialog({
  email,
  open,
  onOpenChange,
}: {
  email: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function change(next: boolean) {
    if (pending) return;
    if (!next) setError(null);
    onOpenChange(next);
  }

  async function confirm() {
    setPending(true);
    setError(null);
    // Caught as well as checked: `change` refuses to close while pending, so a
    // rejection that skipped the reset would leave the dialog impossible to shut.
    const result = await deleteOwnAccount(supabase).catch((cause: unknown) => ({
      error: cause instanceof Error ? cause.message : 'Something went wrong.',
    }));
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
    // The session ends with the account, and signed out looks the same either
    // way; this is the only thing that says the account itself is gone.
    toast('Your account was deleted.');
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-semibold">
            Delete your account?
          </DialogTitle>
          <DialogDescription>
            Your favorites and playlists are deleted with it. Shabads you tagged stay in the archive
            without your name. This cannot be undone.
          </DialogDescription>
          <p className="truncate text-xs text-subtle-foreground">Signed in as {email}</p>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            Could not delete the account: {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => change(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={() => void confirm()}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80"
          >
            {pending ? 'Deleting…' : 'Delete account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
