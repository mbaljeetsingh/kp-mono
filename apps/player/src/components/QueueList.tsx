/**
 * Up next — the real queue when there is one, suggestions when there is not.
 *
 * The queue is empty almost all of the time, so this panel spent its life
 * saying "Nothing queued". The suggestions are deliberately only suggestions:
 * nothing here is queued and nothing plays on its own, because a shabad is
 * often put on for its own sake and continuing unasked is the listener's call.
 */
import { fetchSuggestionGroups } from '@kp/api';
import { upNext, type Playable } from '@kp/core';
import { Button } from '@kp/ui/button';
import { useQuery } from '@tanstack/react-query';
import { Play, X } from 'lucide-react';

import { ArtTile } from '~/components/ArtTile';
import { playerActions, usePlayer } from '~/lib/player';
import { artistPhotoUrl, supabase } from '~/lib/supabase';
import { cn } from '~/lib/utils';

export function QueueList({ className }: { className?: string }) {
  const items = usePlayer((s) => s.items);
  const index = usePlayer((s) => s.index);
  const repeat = usePlayer((s) => s.repeat);
  const current = usePlayer((s) => s.current);

  const queued = upNext({ items, index, repeat });

  const suggestions = useQuery({
    queryKey: ['suggestions', current?.id],
    queryFn: () => fetchSuggestionGroups(supabase, current),
    /*
     * Asked for whenever the queue has nothing, including while a station is
     * playing. A broadcast has no artist or raag to relate to, so the groups
     * fall through to "Recently added" — but Up next should never be a blank
     * panel, and a listener on the radio is exactly who might want somewhere
     * to go next.
     */
    enabled: queued.length === 0,
    staleTime: 1000 * 60 * 5,
  });

  if (queued.length) {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <p className="px-1 text-xs uppercase tracking-wider text-muted-foreground">Up next</p>
        {queued.map((item, i) => (
          <Row
            key={`${item.id}-${i}`}
            item={item}
            onPlay={() => playerActions.playAt(index + 1 + i)}
            onRemove={() => playerActions.removeAt(index + 1 + i)}
          />
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={playerActions.clearQueue}
          className="mt-1 self-start text-muted-foreground"
        >
          Clear queue
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {(suggestions.data ?? []).map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-1 text-xs uppercase tracking-wider text-muted-foreground">
            {group.label}
          </p>
          {group.items.map((item) => (
            <Row key={item.id} item={item} onPlay={() => playerActions.play(item)} />
          ))}
        </div>
      ))}

      {suggestions.isLoading ? (
        <p className="px-1 py-4 text-sm text-muted-foreground">Loading…</p>
      ) : null}

      {!suggestions.isLoading && !(suggestions.data ?? []).length ? (
        <p className="px-1 py-4 text-sm text-muted-foreground">Nothing published yet to suggest.</p>
      ) : null}
    </div>
  );
}

function Row({
  item,
  onPlay,
  onRemove,
}: {
  item: Playable;
  onPlay: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="group flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-accent/50">
      <ArtTile
        name={item.artist ?? item.title}
        src={artistPhotoUrl(item.artistPhoto)}
        className="size-8 text-sm"
      />
      <button type="button" onClick={onPlay} className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm">{item.title}</p>
        <p className="truncate text-xs text-muted-foreground">{item.subtitle ?? item.artist}</p>
      </button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Play ${item.title}`}
        onClick={onPlay}
        className="opacity-0 group-hover:opacity-100"
      >
        <Play />
      </Button>
      {onRemove ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${item.title} from the queue`}
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100"
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}
