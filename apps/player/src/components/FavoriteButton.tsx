/**
 * The heart.
 *
 * Fire-and-forget: an awaited toggle means a heart that lags the tap that
 * pressed it. Signed out it writes to the device; signing in later migrates
 * the list rather than discarding it, so there is no reason to gate this
 * behind an account.
 */
import { Button } from '@kp/ui/button';
import { Heart } from 'lucide-react';

import { useSession } from '~/lib/session';
import { cn } from '~/lib/utils';

export function FavoriteButton({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  const { favorites } = useSession();
  const saved = favorites.has(id);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from saved` : `Save ${name}`}
      onClick={() => favorites.toggle(id)}
      className={cn('rounded-full', saved && 'text-primary', className)}
    >
      <Heart className={saved ? 'fill-current' : undefined} />
    </Button>
  );
}
