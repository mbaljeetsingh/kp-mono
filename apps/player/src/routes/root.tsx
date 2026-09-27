/**
 * The shell: navigation, the outlet, and a transport that never unmounts.
 *
 * The bar sits outside the outlet deliberately — rendering it inside would
 * remount it on every navigation, which stops playback.
 *
 * The phone tab bar is not a fallback. Most listeners arrive on a phone from a
 * shared link, and for them this is the product; the native app earns its place
 * on background audio and the lock screen rather than being a toll gate.
 */
import { Link, Outlet, useLocation } from '@tanstack/react-router';
import { Toaster } from '@kp/ui/sonner';
import { Github, Heart, House, Library, ListMusic, Radio, Search, Users } from 'lucide-react';

import { AccountButton } from '~/components/AccountButton';
import { NowPlayingPanel } from '~/components/NowPlaying';
import { AuthDialog } from '~/components/AuthDialog';
import { NewPlaylistDialog } from '~/components/NewPlaylistDialog';
import { PlayerBar } from '~/components/PlayerBar';
import { SearchField } from '~/components/SearchField';
import { ShuffleButton } from '~/components/ShuffleButton';
import { ThemeToggle } from '@kp/ui/app/theme-toggle';
import { CONTRIBUTE_URL, GITHUB_URL } from '~/lib/links';
import { usePlayerKeys } from '~/lib/keys';
import { useSession } from '~/lib/session';
import { cn } from '~/lib/utils';

/**
 * Search and Ragis are not places of their own: search is a box in the header
 * that finds ragis too, and the directory is a shelf on Home.
 */
const MAIN = [
  { to: '/', label: 'Home', icon: House },
  { to: '/radio', label: 'Radio', icon: Radio },
] as const;

const LIBRARY = [
  { to: '/favorites', label: 'Saved', icon: Heart },
  { to: '/playlists', label: 'Playlists', icon: ListMusic },
] as const;

/** Library is Saved and Playlists together; a phone has room for three. */
const TABS = [...MAIN, { to: '/favorites', label: 'Library', icon: Library }] as const;

function tabActive(to: string, pathname: string) {
  if (to === '/') return pathname === '/';
  if (to === '/favorites') return pathname === to || pathname.startsWith('/playlists');
  return pathname.startsWith(to);
}

export function RootLayout() {
  const { newPlaylistOpen, setNewPlaylistOpen } = useSession();
  usePlayerKeys();
  const pathname = useLocation({ select: (l) => l.pathname });

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-56 shrink-0 flex-col gap-1 border-r border-border p-4 sm:flex">
          <Link to="/" className="mb-4 flex items-center gap-2">
            <img src="/brand/logo-badge.svg" alt="" className="size-7 dark:hidden" />
            <img src="/brand/logo-badge-dark.svg" alt="" className="hidden size-7 dark:block" />
            <span className="font-display text-lg font-semibold">Kirtan Player</span>
          </Link>

          {MAIN.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              activeProps={{ className: 'bg-accent text-foreground' }}
              activeOptions={{ exact: to === '/' }}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}

          <p className="mt-4 px-3 text-[11px] uppercase tracking-wider text-muted-foreground">
            Library
          </p>
          {LIBRARY.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              activeProps={{ className: 'bg-accent text-foreground' }}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}

          {/* The player carries no editing UI: the archive grows in the
              workbench and the code grows on GitHub, so this is where it says so. */}
          <div className="mt-auto flex flex-col gap-2">
            {/*
              Ruled off above and below.

              This is the one link in the sidebar that asks something of the
              reader rather than offering them something, and the archive only
              grows if it is taken up. Sitting in a stack with Source it read as
              one more footer link; alone between two rules it reads as the
              thing the app wants.
            */}
            <a
              href={CONTRIBUTE_URL}
              className="my-1 flex items-center gap-2 border-y border-border py-3 pl-3 pr-2 text-sm font-medium text-primary hover:bg-primary/10"
            >
              <Users className="size-4 shrink-0" />
              Contribute shabads
            </a>
            <a
              href={GITHUB_URL}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <Github className="size-4" />
              Source
            </a>
            {/* The sidebar has the width to say which account this is, so it
                does; the phone header above does not, and keeps the circle. */}
            <div className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <AccountButton variant="row" />
              </div>
              <ThemeToggle />
            </div>
          </div>
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto">
          {/* The mark, which a phone had lost entirely: it lives in the
              sidebar, and the sidebar is what a narrow screen drops — so the
              one corner every site puts its way home in was empty. The badge
              alone rather than the badge and the name: the home screen prints
              "Kirtan Player" in display type an inch below this. */}
          <div className="flex items-center justify-between gap-1 px-4 pt-3 sm:hidden">
            <Link
              to="/"
              aria-label="Kirtan Player — home"
              // Padded down and to the right rather than all round, so the tap
              // target clears 44px without pulling the badge out of line with
              // the content below it.
              className="flex items-center py-1.5 pr-2"
            >
              <img src="/brand/logo-badge.svg" alt="" className="size-8 dark:hidden" />
              <img src="/brand/logo-badge-dark.svg" alt="" className="hidden size-8 dark:block" />
            </Link>

            <div className="flex items-center gap-1">
              <Link
                to="/search"
                aria-label="Search"
                className="flex size-9 items-center justify-center rounded-md hover:bg-accent/50"
              >
                <Search className="size-4" />
              </Link>
              <ShuffleButton />
              <AccountButton />
              <ThemeToggle />
            </div>
          </div>
          <div className="sticky top-0 z-10 hidden items-center justify-center gap-2 border-b border-border bg-background/95 px-6 py-3 backdrop-blur sm:flex">
            <SearchField exitOnClear className="max-w-xl flex-1" />
            <ShuffleButton />
          </div>
          <div className="mx-auto max-w-4xl px-4 py-4 sm:py-6">
            <Outlet />
          </div>
        </main>

        {/* Wide screens get the full player beside the list rather than behind
            a sheet — there is room, and hiding it would be a phone habit
            imported onto a desktop. */}
        <NowPlayingPanel />
      </div>

      <nav className="flex border-t border-border sm:hidden">
        {TABS.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] text-muted-foreground',
              tabActive(to, pathname) && 'text-primary'
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </nav>

      <PlayerBar />

      <AuthDialog />
      <NewPlaylistDialog open={newPlaylistOpen} onOpenChange={setNewPlaylistOpen} />
      <Toaster />
    </div>
  );
}
