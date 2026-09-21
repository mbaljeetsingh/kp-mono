/**
 * Fetches the next page when the sentinel comes into view.
 *
 * An IntersectionObserver rather than a scroll handler: the archive lists are
 * long, and a scroll listener firing on every frame of a flick is the one thing
 * guaranteed to make a long list feel worse than it is.
 */
import { useEffect, useRef } from 'react';
import { useIntersectionObserver } from 'usehooks-ts';

interface Props {
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
}

export function InfiniteScroll({ onLoadMore, hasMore, loading }: Props) {
  // Start fetching before the sentinel is actually visible, so the next page is
  // usually there by the time the listener reaches it.
  const { isIntersecting, ref } = useIntersectionObserver({ rootMargin: '400px' });

  // Ref'd so the effect below depends on visibility alone — an inline callback
  // from the parent changes identity every render and would refire constantly.
  //
  // Mirrored in an effect rather than during render, for the same reason as
  // the admin workbench's player: a render React throws away still runs its
  // body, so assigning here would publish a callback from a render that never
  // happened.
  const load = useRef(onLoadMore);
  useEffect(() => {
    load.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    if (isIntersecting && hasMore && !loading) load.current();
  }, [isIntersecting, hasMore, loading]);

  if (!hasMore) return null;

  return (
    <div ref={ref} className="py-6 text-center text-sm text-muted-foreground">
      {loading ? 'Loading…' : ''}
    </div>
  );
}
