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
 *
 * The header language decides what is typed: roman letters, or GurbaniLipi keys
 * drawn in the GurbaniLipi font, as the read-along's search takes them.
 */
import { ShabadInput } from '@kp/ui/app/shabad-input';
import {
  useCanGoBack,
  useLocation,
  useNavigate,
  useRouter,
  useSearch,
} from '@tanstack/react-router';

import { useRecentSearches } from '~/lib/recent-searches';
import { useTitleScript } from '~/lib/title-script';

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
  const [script] = useTitleScript();
  const punjabi = script === 'pa';
  const { save } = useRecentSearches();

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
    <ShabadInput
      value={q}
      onChange={onChange}
      onSubmit={() => save(q)}
      gurbaniLipi={punjabi}
      autoFocus={autoFocus}
      placeholder={punjabi ? 'ਪਹਿਲੇ ਅੱਖਰ ਲਿਖੋ…' : 'Shabad first letters or ragi…'}
      ariaLabel={punjabi ? 'Search shabads' : 'Search shabads and ragis'}
      className={className}
      inputClassName="rounded-full"
    />
  );
}
