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

import { ArtTile } from '~/components/ArtTile';
import { FavoriteButton } from '~/components/FavoriteButton';
import { LiveBadge } from '~/components/LiveBadge';
import { LyricsPanel } from '~/components/LyricsPanel';
import { PlayerControls } from '~/components/PlayerControls';
import { QueueList } from '~/components/QueueList';
import { SeekBar } from '~/components/SeekBar';
import { usePlayer } from '~/lib/player';
import { artistPhotoUrl } from '~/lib/supabase';

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
  if (!current) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* What you scan sits at the top; what you touch sits at the bottom. The
          transport is pinned below the scrolling text for the same reason every
          music app puts it there: the bottom third of a phone is where a thumb
          already rests, and anything higher needs a second hand. */}
      {header ? (
      <div className="flex items-center gap-3 px-4 pb-3">
        <ArtTile
          name={current.artist ?? current.title}
          src={artistPhotoUrl(current.artistPhoto)}
          rounded="lg"
          className="size-14 text-2xl"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{current.title}</p>
          {current.artist ? (
            <Link
              to="/ragis/$name"
              params={{ name: current.artist }}
              onClick={onClose}
              className="truncate text-sm text-muted-foreground hover:text-foreground">
              {current.subtitle ?? current.artist}
            </Link>
          ) : (
            <p className="truncate text-sm text-muted-foreground">{current.subtitle}</p>
          )}
          {current.isLive ? <LiveBadge /> : null}
        </div>
        {/* A broadcast is not something to save — there is no rendition behind it. */}
        {current.isLive ? null : <FavoriteButton id={current.id} name={current.title} />}
      </div>
      ) : null}

      <Tabs defaultValue="lyrics" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-4 self-start">
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
          <PlayerControls size="lg" />
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
        className="flex h-[92dvh] flex-col gap-4 overflow-hidden p-0 pt-3 data-[side=bottom]:h-[92dvh]">
        <SheetHeader className="flex-row items-center px-4 py-0">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close"
            onClick={() => onOpenChange(false)}>
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
  return (
    <aside className="hidden w-80 shrink-0 flex-col border-l border-border py-4 lg:flex">
      {/* No header and no transport: the bar directly below already carries
          the artwork, the title, the artist and every control, and repeating
          them an inch apart is just noise. The panel is the tabs. */}
      <Body transport={false} header={false} />
    </aside>
  );
}
