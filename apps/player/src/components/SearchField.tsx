/**
 * The one search box, wherever it is drawn.
 *
 * The term lives in the URL rather than in state, so the header's box on a
 * desktop and the search page's own box on a phone are the same search — and a
 * result list survives a reload or a shared link. Typing anywhere else opens
 * /search; typing on it replaces the entry, so Back leaves search in one step
 * instead of one keystroke at a time.
 *
 * The header's box has no page of its own, so emptying it (the clear button,
 * Escape, or deleting the last character) goes back to wherever the search
 * began — an empty results page there reads as something broken. The phone's
 * box is its page, so it stays put and waits for a new term.
 */
import { Input } from '@kp/ui/input';
import {
  useCanGoBack,
  useLocation,
  useNavigate,
  useRouter,
  useSearch,
} from '@tanstack/react-router';
import { Search } from 'lucide-react';

import { cn } from '~/lib/utils';

interface Props {
  autoFocus?: boolean;
  /** Leave /search when the box is emptied. */
  exitOnClear?: boolean;
  className?: string;
}

export function SearchField({ autoFocus, exitOnClear, className }: Props) {
  const q = useSearch({ strict: false, select: (s) => s.q ?? '' });
  const onSearchPage = useLocation({ select: (l) => l.pathname === '/search' });
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  function onChange(value: string) {
    if (!value && exitOnClear && onSearchPage) {
      // A shared /search link has no in-app page behind it; Home stands in.
      if (canGoBack) router.history.back();
      else void navigate({ to: '/', replace: true });
      return;
    }
    void navigate({ to: '/search', search: { q: value }, replace: onSearchPage });
  }

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Shabad or ragi…"
        aria-label="Search shabads and ragis"
        className="rounded-full pl-9"
      />
    </div>
  );
}
