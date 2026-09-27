/**
 * Saved and Playlists, one tab apart on a phone.
 *
 * The phone has one Library tab for both; the sidebar lists them separately,
 * so on a wide screen this would only repeat it.
 */
import { Link } from '@tanstack/react-router';

const PILL = 'rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground';

export function LibraryTabs() {
  return (
    <nav aria-label="Library" className="flex gap-1 sm:hidden">
      {(['/favorites', '/playlists'] as const).map((to) => (
        <Link
          key={to}
          to={to}
          replace
          className={PILL}
          activeProps={{ className: 'bg-primary-soft text-primary' }}
        >
          {to === '/favorites' ? 'Saved' : 'Playlists'}
        </Link>
      ))}
    </nav>
  );
}
