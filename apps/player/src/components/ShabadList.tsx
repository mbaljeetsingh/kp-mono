/**
 * A paged list of renditions.
 *
 * Reads `current` and `playing` once here and hands them down, so a fifty-row
 * shelf holds two store subscriptions rather than a hundred.
 */
import type { Playable } from '@kp/core';
import { Button } from '@kp/ui/button';

import { ShabadRow } from '~/components/ShabadRow';
import { usePlayer } from '~/lib/player';

interface Props {
  items: Playable[];
  loading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  empty?: string;
}

export function ShabadList({ items, loading, onLoadMore, hasMore, empty }: Props) {
  const currentId = usePlayer((s) => s.current?.id);
  const playing = usePlayer((s) => s.playing);

  if (!loading && items.length === 0) {
    return <p className="px-3 py-8 text-sm text-muted-foreground">{empty ?? 'Nothing here yet.'}</p>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item) => (
        <ShabadRow
          key={item.id}
          item={item}
          isCurrent={item.id === currentId}
          playing={playing}
        />
      ))}

      {loading ? <p className="px-3 py-4 text-sm text-muted-foreground">Loading…</p> : null}

      {hasMore && !loading ? (
        <Button variant="outline" onClick={onLoadMore} className="mx-3 mt-2">
          Show more
        </Button>
      ) : null}
    </div>
  );
}
