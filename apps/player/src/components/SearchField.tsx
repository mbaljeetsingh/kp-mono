/**
 * The one search box, wherever it is drawn.
 *
 * The term lives in the URL rather than in state, so the header's box on a
 * desktop and the search page's own box on a phone are the same search — and a
 * result list survives a reload or a shared link. Typing anywhere else opens
 * /search; typing on it replaces the entry, so Back leaves search in one step
 * instead of one keystroke at a time.
 */
import { Input } from '@kp/ui/input';
import { useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import { Search } from 'lucide-react';

import { cn } from '~/lib/utils';

export function SearchField({ autoFocus, className }: { autoFocus?: boolean; className?: string }) {
  const q = useSearch({ strict: false, select: (s) => s.q ?? '' });
  const onSearchPage = useLocation({ select: (l) => l.pathname === '/search' });
  const navigate = useNavigate();

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={q}
        autoFocus={autoFocus}
        onChange={(e) =>
          void navigate({ to: '/search', search: { q: e.target.value }, replace: onSearchPage })
        }
        placeholder="Shabad or ragi…"
        aria-label="Search shabads and ragis"
        className="rounded-full pl-9"
      />
    </div>
  );
}
