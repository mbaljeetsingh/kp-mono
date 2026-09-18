/**
 * A paged list of renditions.
 *
 * Reads `current` and `playing` once here and hands them down, so a fifty-row
 * shelf holds two store subscriptions rather than a hundred.
 */
import type { Playable } from '@kp/core';

import { EmptyState } from '~/components/EmptyState';
import { InfiniteScroll } from '~/components/InfiniteScroll';
import { ShabadRow } from '~/components/ShabadRow';
import { playerActions, usePlayer } from '~/lib/player';

interface Props {
  items: Playable[];
  loading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  empty?: string;
  emptyHint?: string;
}

export function ShabadList({ items, loading, onLoadMore, hasMore, empty, emptyHint }: Props) {
  const currentId = usePlayer((s) => s.current?.id);
  const playing = usePlayer((s) => s.playing);

  /**
   * Playing a row loads the rest of the shelf behind it, which is what makes
   * this a player rather than a file opener: one tap plays a shabad and lines
   * up what follows without the listener queueing anything by hand.
   */
  function playFrom(item: Playable) {
    const index = items.findIndex((i) => i.id === item.id);
    playerActions.playList(items, index < 0 ? 0 : index);
  }

  if (!loading && items.length === 0) {
    return <EmptyState title={empty ?? 'Nothing here yet.'} hint={emptyHint} />;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item) => (
        <ShabadRow
          key={item.id}
          item={item}
          isCurrent={item.id === currentId}
          playing={playing}
          onPlay={playFrom}
        />
      ))}

      {loading && items.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
      ) : null}

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
