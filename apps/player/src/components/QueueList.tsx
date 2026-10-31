/**
 * Up next — the real queue when there is one, suggestions when there is not.
 *
 * The queue is empty almost all of the time, so this panel spent its life
 * saying "Nothing queued". The suggestions are deliberately only suggestions:
 * nothing here is queued and nothing plays on its own, because a shabad is
 * often put on for its own sake and continuing unasked is the listener's call.
 */
import { fetchSuggestionGroups, useOtherRecordings } from '@kp/api';
import { clock, segmentTotal, upNext, type Playable } from '@kp/core';
import { Button } from '@kp/ui/button';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Play, X } from 'lucide-react';
import { useState, type MouseEvent } from 'react';

import { PlayableArt } from '~/components/ArtTile';
import { ShabadTitle } from '~/components/ShabadTitle';
import { playerActions, usePlayer } from '~/lib/player';
import { useShownTitle } from '~/lib/title-script';
import { supabase } from '~/lib/supabase';
import { cn } from '~/lib/utils';

export function QueueList({ className }: { className?: string }) {
  const currentId = usePlayer((s) => s.current?.id);
  return (
    <>
      {/* Keyed, so it closes again when the shabad changes. */}
      <OtherRecordings key={currentId} />
      <Queue className={className} />
    </>
  );
}

/**
 * The same shabad in other voices. Most listeners want this only now and then,
 * so it is one line until asked for, and nothing at all for a shabad with one
 * recording. Only a rendition's own tag counts: a looked-up shabad is the
 * listener's guess, and the archive should not vouch for it.
 */
function OtherRecordings() {
  const current = usePlayer((s) => s.current);
  const others = useOtherRecordings(supabase, current?.shabadId, current?.id).data ?? [];
  const [open, setOpen] = useState(false);
  if (!others.length) return null;

  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="mb-2 border-b border-border pb-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1.5 text-left text-xs font-medium text-primary hover:bg-accent/50"
      >
        {others.length === 1 ? '1 other recording' : `${others.length} other recordings`} of this
        shabad
        <Chevron className="size-3.5 shrink-0" />
      </button>
      {open
        ? others.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => playerActions.swapCurrent(item)}
              className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-2 text-left text-sm hover:bg-accent/50"
            >
              <span className="min-w-0 truncate">{item.subtitle ?? item.artist ?? item.title}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {clock(segmentTotal(item, 0))}
              </span>
            </button>
          ))
        : null}
    </div>
  );
}

function Queue({ className }: { className?: string }) {
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
  const title = useShownTitle(item);
  /**
   * The whole row plays, the same as a shelf row: the thumbnail and the gap
   * beside the title were dead space, and that is where a click lands.
   * Anything with a click of its own — the remove X, the play button, the
   * title button that is this row's keyboard target — is skipped by finding it
   * in the click's ancestry, so it fires once rather than twice.
   */
  function onRowClick(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as Element).closest('a,button')) return;
    onPlay();
  }

  return (
    <div
      onClick={onRowClick}
      className="group flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-accent/50"
    >
      <PlayableArt item={item} className="size-8 text-sm" />
      <button type="button" onClick={onPlay} className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm">
          <ShabadTitle item={item} />
        </p>
        <p className="truncate text-xs text-muted-foreground">{item.subtitle ?? item.artist}</p>
      </button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Play ${title}`}
        onClick={onPlay}
        className="opacity-0 group-hover:opacity-100"
      >
        <Play />
      </Button>
      {onRemove ? (
        // Shown outright where there is no hover: the row itself plays, so a
        // phone loses nothing by leaving the play button to the pointer — but
        // removing something from the queue has no other way in.
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${title} from the queue`}
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 touch:opacity-100"
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}
