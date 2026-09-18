/**
 * The persistent transport.
 *
 * Never unmounts — it sits outside the router outlet, so navigating does not
 * interrupt playback or reset the queue. On a phone the whole strip opens the
 * full player, which is the gesture people already expect from every other
 * music app; the controls stop that from firing so a tap on Play is a play.
 */
import { ChevronUp } from 'lucide-react';
import { useState } from 'react';

import { ArtTile } from '~/components/ArtTile';
import { FavoriteButton } from '~/components/FavoriteButton';
import { LiveBadge } from '~/components/LiveBadge';
import { NowPlayingSheet } from '~/components/NowPlaying';
import { PlayerControls } from '~/components/PlayerControls';
import { SeekBar } from '~/components/SeekBar';
import { usePlayer } from '~/lib/player';
import { artistPhotoUrl } from '~/lib/supabase';

export function PlayerBar() {
  const current = usePlayer((s) => s.current);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Nothing loaded means no bar at all, rather than a dead strip of controls.
  if (!current) return null;

  return (
    <>
      <footer className="border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2 sm:gap-4 sm:px-4 sm:py-3">
          {/* Tapping opens the sheet only where there is no side panel. On a
              wide screen the full player is already on screen, so a sheet over
              the top of it would be a second copy of the same thing. */}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="Open the full player"
            className="flex min-w-0 flex-1 items-center gap-3 text-left lg:pointer-events-none">
            <ArtTile
              name={current.artist ?? current.title}
              src={artistPhotoUrl(current.artistPhoto)}
              className="size-10 text-lg"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{current.title}</span>
              {/* Inline with the subtitle, not under it: on its own line the
                  badge wrapped below the transport and pushed the whole strip
                  out of alignment whenever a station was playing. */}
              <span className="flex min-w-0 items-center gap-2">
                {current.isLive ? <LiveBadge /> : null}
                <span className="truncate text-xs text-muted-foreground">
                  {current.subtitle ?? current.artist}
                </span>
              </span>
            </span>
            <ChevronUp className="size-4 shrink-0 text-muted-foreground lg:hidden" />
          </button>

          <div className="hidden flex-[2] flex-col items-center gap-1 sm:flex">
            <PlayerControls />
            <SeekBar />
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {/* A broadcast is not something to save — there is no rendition behind it. */}
            {current.isLive ? null : (
              <FavoriteButton id={current.id} name={current.title} className="hidden sm:flex" />
            )}
            {/* The phone keeps only play/pause on the bar; everything else is a
                tap away in the sheet, and four icons at this width is a row of
                targets too small to hit. */}
            <div className="sm:hidden">
              <PlayerControls />
            </div>
          </div>
        </div>
      </footer>

      <NowPlayingSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
