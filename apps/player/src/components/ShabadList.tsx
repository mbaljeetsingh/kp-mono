/**
 * A paged list of renditions.
 *
 * Reads `current` and `playing` once here and hands them down, so a fifty-row
 * shelf holds two store subscriptions rather than a hundred.
 */
import type { LineSegment } from '@kp/api';
import type { Playable } from '@kp/core';

import { MarkedLine } from '@kp/ui/app/marked-line';

import { EmptyState } from '~/components/EmptyState';
import { InfiniteScroll } from '~/components/InfiniteScroll';
import { ShabadRow } from '~/components/ShabadRow';
import { ShabadRowSkeletons } from '~/components/ShabadRowSkeletons';
import { playerActions, usePlayer } from '~/lib/player';
import { cn } from '~/lib/utils';

interface Props {
  items: Playable[];
  loading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  empty?: string;
  emptyHint?: string;
  /** Line headings, by the id of the row each goes above. */
  headings?: Map<string, LineSegment[]>;
  /** A row was played, for a page that cares which list it came from. */
  onPlay?: (item: Playable) => void;
}

/** The line the rows below it were found through. */
function LineHeadingRow({ parts }: { parts: LineSegment[] }) {
  return (
    <p className="px-2 pb-0.5 pt-3 text-sm text-muted-foreground">
      <MarkedLine parts={parts} />
    </p>
  );
}

export function ShabadList({
  items,
  loading,
  onLoadMore,
  hasMore,
  empty,
  emptyHint,
  headings,
  onPlay,
}: Props) {
  const currentId = usePlayer((s) => s.current?.id);
  const playing = usePlayer((s) => s.playing);
  const firstGrouped = headings ? items.findIndex((item) => headings.has(item.id)) : -1;

  /**
   * Playing a row loads the rest of the shelf behind it, which is what makes
   * this a player rather than a file opener: one tap plays a shabad and lines
   * up what follows without the listener queueing anything by hand.
   */
  function playFrom(item: Playable) {
    const index = items.findIndex((i) => i.id === item.id);
    playerActions.playList(items, index < 0 ? 0 : index);
    onPlay?.(item);
  }

  if (!loading && items.length === 0) {
    return <EmptyState title={empty ?? 'Nothing here yet.'} hint={emptyHint} />;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item, index) => {
        const heading = headings?.get(item.id);
        const grouped = firstGrouped >= 0 && index >= firstGrouped;
        const next = items[index + 1];
        const row = (
          <ShabadRow
            item={item}
            isCurrent={item.id === currentId}
            playing={playing}
            onPlay={playFrom}
          />
        );
        return (
          <div key={item.id}>
            {heading ? <LineHeadingRow parts={heading} /> : null}
            {grouped ? (
              // Lines from the heading to each row, not a card around them: rows
              // have their own hover and playing backgrounds, which a card fights.
              <div className="relative pl-4">
                <span
                  aria-hidden
                  className={cn(
                    // Past the row's edges: the list's gaps would otherwise break the line.
                    'absolute -top-0.5 left-2 w-px bg-input',
                    !next || headings?.has(next.id) ? 'bottom-1/2' : '-bottom-0.5'
                  )}
                />
                <span aria-hidden className="absolute left-2 top-1/2 h-px w-2 bg-input" />
                {row}
              </div>
            ) : (
              row
            )}
          </div>
        );
      })}

      {loading && items.length === 0 ? <ShabadRowSkeletons /> : null}

      {onLoadMore ? (
        <InfiniteScroll
          onLoadMore={onLoadMore}
          hasMore={Boolean(hasMore)}
          loading={Boolean(loading)}
        />
      ) : null}
    </div>
  );
}
