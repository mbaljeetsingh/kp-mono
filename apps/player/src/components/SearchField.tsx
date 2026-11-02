/**
 * The one search box, wherever it is drawn.
 *
 * The term lives in the URL rather than in state, so the header's box on a
 * desktop and the search page's own box on a phone are the same search — and a
 * result list survives a reload or a shared link. Typing anywhere else opens
 * /search; typing on it replaces the entry, so Back leaves search in one step
 * instead of one keystroke at a time.
 *
 * An empty /search is a page of its own (SearchEmptyState), so emptying the box
 * stays on it. Clicking the header's box opens it: a desktop has no other way to
 * reach that page, whose recent searches are of most use before anything is typed.
 *
 * The header language decides what is typed: roman letters, or GurbaniLipi keys
 * drawn in the GurbaniLipi font, as the read-along's search takes them.
 */
import { ShabadInput } from '@kp/ui/app/shabad-input';
import { useLocation, useNavigate, useSearch } from '@tanstack/react-router';

import { useRecentSearches } from '~/lib/recent-searches';
import { useTitleScript } from '~/lib/title-script';

interface Props {
  autoFocus?: boolean;
  className?: string;
}

export function SearchField({ autoFocus, className }: Props) {
  const q = useSearch({ strict: false, select: (s) => s.q ?? '' });
  const onSearchPage = useLocation({ select: (l) => l.pathname === '/search' });
  const navigate = useNavigate();
  const [script] = useTitleScript();
  const punjabi = script === 'pa';
  const { save } = useRecentSearches();

  function onChange(value: string) {
    void navigate({ to: '/search', search: { q: value }, replace: onSearchPage });
  }

  return (
    <ShabadInput
      value={q}
      onChange={onChange}
      onSubmit={() => save(q)}
      // A click, not focus: coming back to this browser tab refocuses the box.
      onClick={() => {
        if (!onSearchPage) void navigate({ to: '/search' });
      }}
      gurbaniLipi={punjabi}
      autoFocus={autoFocus}
      placeholder={punjabi ? 'ਪਹਿਲੇ ਅੱਖਰ ਲਿਖੋ…' : 'Shabad first letters or ragi…'}
      ariaLabel={punjabi ? 'Search shabads' : 'Search shabads and ragis'}
      className={className}
      inputClassName="rounded-full"
    />
  );
}
