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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@kp/ui/dialog';
import { Input } from '@kp/ui/input';
import { Label } from '@kp/ui/label';
import { useState, type FormEvent } from 'react';
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {/*
         * Keyed on the open state so every open mounts an empty form. This was
         * an effect clearing the name and the error when `open` turned true,
         * which ran a render after the dialog was on screen — the last
         * playlist's name was briefly visible in the field. Keyed rather than
         * conditionally rendered so the content is still there to animate out.
         */}
        <NewPlaylistForm key={String(open)} onCreated={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function NewPlaylistForm({ onCreated }: { onCreated: () => void }) {
  const { userId, pendingPick, setPendingPick } = useSession();
  const { create, addItem } = usePlaylistMutations(supabase, userId);

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !userId) return;
    setError(null);
    let playlist;
    try {
      playlist = await create.mutateAsync(name);
    } catch {
      // Its own words, not the server's: since @kp/api throws real Errors, the
      // message would be Postgres's — "violates check constraint …" for a
      // listener who typed a long name.
      setError('Could not create the playlist. Try again in a moment.');
      return;
    }
    // The whole point of the pending pick: the listener asked to file a shabad
    // and had no playlist to file it into. Its own step: a failure here, read
    // as "could not create", got Create pressed again and made a second one.
    if (pendingPick) {
      try {
        await addItem.mutateAsync({ playlistId: playlist.id, renditionId: pendingPick.id });
        toast.success(`Added “${pendingPick.name}” to ${playlist.name}`);
      } catch {
        toast.error(`Created ${playlist.name}, but couldn't add “${pendingPick.name}” to it.`);
      }
      setPendingPick(null);
    }
    onCreated();
  }

  return (
    <>
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
            // playlists_name_check: 1 to 120 characters.
            maxLength={120}
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
    </>
  );
}
