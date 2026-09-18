/**
 * The review queue.
 *
 * Everything a contributor proposes lands here. Nothing reaches the player
 * until somebody publishes it, which is the only thing the trust ladder gates.
 */
import {
  canPublishRendition,
  deleteRendition,
  setRenditionStatus,
  usePending,
  usePermissions,
  useAuth,
  type PendingRendition,
} from '@kp/api';
import { Badge } from '@kp/ui/badge';
import { Button } from '@kp/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Check, Play, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { supabase } from '~/lib/supabase';
import { clock } from '~/lib/utils';

export function PendingRoute() {
  const { session } = useAuth(supabase);
  const { can } = usePermissions(supabase, Boolean(session));
  const query = usePending(supabase, Boolean(session));
  const queryClient = useQueryClient();

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * Created in JS rather than rendered, so nothing tears it down on
   * navigation — without this a preview keeps playing after the reviewer has
   * left the page, with no UI left to stop it.
   */
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audio.current?.pause(), []);

  function preview(row: PendingRendition) {
    if (!row.tracks?.url) return;
    if (!audio.current) audio.current = new Audio();
    audio.current.src = row.tracks.url;
    audio.current.currentTime = Number(row.start_sec);
    void audio.current.play().catch(() => setError('Could not start that preview.'));
  }

  async function run(id: string, work: () => Promise<unknown>) {
    setError(null);
    setBusy(id);
    try {
      await work();
      await queryClient.invalidateQueries({ queryKey: ['pending'] });
      await queryClient.invalidateQueries({ queryKey: ['recordings'] });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  }

  const rows = query.data ?? [];

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">
          Review <span className="text-base font-normal text-muted-foreground">({rows.length})</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Proposed segments, oldest first. Nothing here is in the player yet.
        </p>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      {!query.isLoading && !rows.length ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing waiting. Every proposed segment has been dealt with.
        </p>
      ) : null}

      <div className="flex flex-col gap-0.5">
        {rows.map((row) => {
          const mine = row.created_by === session?.user.id;
          const publishable = canPublishRendition(
            row,
            { review: can['renditions.review'], publish: can['renditions.publish'] },
            session?.user.id
          );

          return (
            <div
              key={row.id}
              className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent/50">
              <div className="min-w-0 flex-1">
                <Link
                  to="/tag/$id"
                  params={{ id: row.track_id }}
                  // From review there is no shelf to preserve — the tagger
                  // arrived from a different list entirely.
                  search={{}}
                  className="truncate text-sm hover:underline">
                  {row.name}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  {row.tracks?.artist_dir ?? 'Unknown'}
                  {row.tracks?.date ? ` · ${row.tracks.date}` : ''}
                  {` · ${clock(Number(row.start_sec))}–${clock(Number(row.end_sec))}`}
                  {mine ? ' · yours' : ''}
                </p>
              </div>

              <Badge variant="secondary" className="shrink-0">
                {row.status}
              </Badge>

              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Preview ${row.name}`}
                onClick={() => preview(row)}>
                <Play />
              </Button>

              {publishable ? (
                <Button
                  size="sm"
                  disabled={busy === row.id}
                  onClick={() => void run(row.id, () => setRenditionStatus(supabase, row.id, 'published'))}>
                  <Check />
                  Publish
                </Button>
              ) : null}

              {can['renditions.delete'] ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Reject ${row.name}`}
                  disabled={busy === row.id}
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    // Rejecting throws away someone's listening, so it asks.
                    if (window.confirm(`Reject “${row.name}”? This deletes the draft.`)) {
                      void run(row.id, () => deleteRendition(supabase, row.id));
                    }
                  }}>
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Said rather than left blank: a contributor who cannot publish should
          know that is a trust level, not a broken page. */}
      {!can['renditions.publish'] && rows.length ? (
        <p className="text-xs text-muted-foreground">
          You can see the queue but not publish from it — that comes with the trust ladder.
        </p>
      ) : null}
    </section>
  );
}
