/**
 * The full player.
 *
 * One component for both surfaces: a sheet on a phone, a side panel on the
 * desktop. The read-along sits where the artwork was, which is where every
 * music player puts lyrics, and Up next shares the same tabs rather than
 * living in a second panel nobody could see at the same time.
 */
import { Button } from '@kp/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@kp/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kp/ui/tabs';
import { Link } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';

import { PlayableArt } from '~/components/ArtTile';
import { FavoriteButton } from '~/components/FavoriteButton';
import { LiveBadge } from '~/components/LiveBadge';
import { LyricsPanel } from '~/components/LyricsPanel';
import { PlayerControls } from '~/components/PlayerControls';
import { QueueList } from '~/components/QueueList';
import { SeekBar } from '~/components/SeekBar';
import { ShabadTitle } from '~/components/ShabadTitle';
import { ShareButton } from '~/components/ShareButton';
import { usePlayer } from '~/lib/player';
import { useTitleScript } from '~/lib/title-script';
import { titleIn } from '@kp/core';

/**
 * `transport` is false for the desktop panel.
 *
 * The bar along the bottom of the window already owns play, skip and the
 * scrubber, and the panel sits directly above it — rendering them again put two
 * identical transports on screen, one of them within an inch of the other.
 * On a phone the bar is covered by the sheet, so there the sheet has to carry
 * them.
 */
function Body({
  onClose,
  transport = true,
  header = true,
}: {
  onClose?: () => void;
  transport?: boolean;
  header?: boolean;
}) {
  const current = usePlayer((s) => s.current);
  const [script] = useTitleScript();
  if (!current) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* What you scan sits at the top; what you touch sits at the bottom. The
          transport is pinned below the scrolling text for the same reason every
          music app puts it there: the bottom third of a phone is where a thumb
          already rests, and anything higher needs a second hand. */}
      {header ? (
        <div className="flex items-center gap-3 px-4 pb-3">
          <PlayableArt item={current} className="size-14 rounded-lg text-2xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">
              <ShabadTitle item={current} />
            </p>
            {current.artist ? (
              <Link
                to="/ragis/$name"
                params={{ name: current.artist }}
                onClick={onClose}
                // Block, or truncate does nothing — a link is inline, and a
                // long ragi line ran on under the share button. w-fit keeps the
                // link as wide as its text; max-w-full caps that at the
                // column, without which w-fit undoes the truncate.
                className="block w-fit max-w-full truncate text-sm text-muted-foreground hover:text-foreground"
              >
                {current.subtitle ?? current.artist}
              </Link>
            ) : (
              <p className="truncate text-sm text-muted-foreground">{current.subtitle}</p>
            )}
            {current.isLive ? <LiveBadge /> : null}
          </div>
          {/* Up here with the title, not mirroring the heart down in the
              transport: the right-hand end of that row is repeat's, and on a
              320px phone a button pinned there sat on top of it. Sharing is
              done once, not while listening, so the reach costs little. */}
          {current.isLive ? null : <ShareButton item={current} className="size-10 shrink-0" />}
        </div>
      ) : null}

      <Tabs defaultValue="lyrics" className="flex min-h-0 flex-1 flex-col">
        {/* Full width with equal halves: two tabs hugging the left edge leave
            a stripe of dead space beside them, and a wider target is easier to
            hit on a phone. */}
        <TabsList className="mx-4 grid grid-cols-2">
          <TabsTrigger value="lyrics">Read along</TabsTrigger>
          <TabsTrigger value="queue">Up next</TabsTrigger>
        </TabsList>
        <TabsContent value="lyrics" className="min-h-0 flex-1">
          <LyricsPanel className="h-full" />
        </TabsContent>
        <TabsContent value="queue" className="min-h-0 flex-1 overflow-y-auto px-3">
          <QueueList />
        </TabsContent>
      </Tabs>

      {transport ? (
        <div className="flex shrink-0 flex-col items-center gap-2 border-t border-border px-4 pb-5 pt-3">
          <SeekBar />
          {/* The heart rides with the transport rather than up beside the
              title. Saving a shabad is something you do while listening to it,
              and on a phone the title is at the top of a full-height sheet
              while the thumb is down here with everything else it can reach.
              Positioned rather than sitting in the row: a heart taking a slot
              on one side alone would push the transport half a button to the
              right, and the transport is the one thing on this screen whose
              position is worth keeping exactly where it was. */}
          <div className="relative flex w-full items-center justify-center">
            {/* A broadcast is not something to save — there is no rendition
                behind it. */}
            {current.isLive ? null : (
              <FavoriteButton
                id={current.id}
                name={titleIn(current, script)}
                className="absolute left-0 top-1/2 size-10 -translate-y-1/2"
              />
            )}
            <PlayerControls size="lg" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function NowPlayingSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* The height needs the same data-attribute variant the base classes
          use: SheetContent ships `data-[side=bottom]:h-auto`, which outranks a
          plain `h-[92dvh]` and let the sheet grow past the screen — carrying
          its own header and the transport off the top. */}
      <SheetContent
        side="bottom"
        className="flex h-[92dvh] flex-col gap-4 overflow-hidden p-0 pt-3 data-[side=bottom]:h-[92dvh]"
      >
        <SheetHeader className="flex-row items-center px-4 py-0">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
          >
            <ChevronDown />
          </Button>
          <SheetTitle className="sr-only">Now playing</SheetTitle>
        </SheetHeader>
        <Body onClose={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

/** The desktop panel. Same body, no sheet around it. */
export function NowPlayingPanel() {
  const current = usePlayer((s) => s.current);
  /*
   * Nothing playing, no panel. The body already renders nothing then, but the
   * column around it stayed: a bordered, empty 20rem strip taking a quarter
   * of the window from the list a first-time visitor is choosing from.
   */
  if (!current) return null;
  return (
    <aside className="hidden w-80 shrink-0 flex-col border-l border-border py-4 lg:flex">
      {/* No header and no transport: the bar directly below already carries
          the artwork, the title, the artist and every control, and repeating
          them an inch apart is just noise. The panel is the tabs. */}
      <Body transport={false} header={false} />
    </aside>
  );
}
