/**
 * Create a playlist, optionally holding a shabad to drop into it.
 *
 * Mounted once in the shell rather than per row: a dialog inside the row menu
 * would be one mounted dialog per visible shabad. The pending pick carries its
 * name as well as its id so the dialog can say which shabad it is holding —
 * which matters most when the pick survived a sign-in detour and the listener
 * is several steps from the row they tapped.
 */
import { usePlaylistMutations } from '@kp/api';
import { Button } from '@kp/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@kp/ui/dialog';
import { Input } from '@kp/ui/input';
import { Label } from '@kp/ui/label';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';

export function NewPlaylistDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { userId, pendingPick, setPendingPick } = useSession();
  const { create, addItem } = usePlaylistMutations(supabase, userId);

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setError(null);
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !userId) return;
    setError(null);
    try {
      const playlist = await create.mutateAsync(name);
      // The whole point of the pending pick: the listener asked to file a
      // shabad and had no playlist to file it into.
      if (pendingPick) {
        await addItem.mutateAsync({ playlistId: playlist.id, renditionId: pendingPick.id });
        toast.success(`Added “${pendingPick.name}” to ${playlist.name}`);
        setPendingPick(null);
      }
      onOpenChange(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not create the playlist');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New playlist</DialogTitle>
          {pendingPick ? (
            <DialogDescription>“{pendingPick.name}” goes in once it exists.</DialogDescription>
          ) : null}
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="playlist-name">Name</Label>
            <Input
              id="playlist-name"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder="Morning kirtan"
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={!name.trim() || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
