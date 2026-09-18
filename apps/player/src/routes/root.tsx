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
import { Link, Outlet } from '@tanstack/react-router';
import { Toaster } from '@kp/ui/sonner';
import { Disc3, Github, Heart, ListMusic, Radio, Search, Users } from 'lucide-react';

import { AccountButton } from '~/components/AccountButton';
import { NowPlayingPanel } from '~/components/NowPlaying';
import { AuthDialog } from '~/components/AuthDialog';
import { NewPlaylistDialog } from '~/components/NewPlaylistDialog';
import { PlayerBar } from '~/components/PlayerBar';
import { ThemeToggle } from '~/components/ThemeToggle';
import { CONTRIBUTE_URL, GITHUB_URL } from '~/lib/links';
import { usePlayerKeys } from '~/lib/keys';
import { useSession } from '~/lib/session';

const MAIN = [
  { to: '/', label: 'Shabads', icon: Disc3 },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/ragis', label: 'Ragis', icon: Users },
  { to: '/radio', label: 'Radio', icon: Radio },
] as const;

const LIBRARY = [
  { to: '/favorites', label: 'Saved', icon: Heart },
  { to: '/playlists', label: 'Playlists', icon: ListMusic },
] as const;

/** Four on a phone: a fifth tab makes each one too narrow to hit reliably. */
const TABS = [...MAIN.slice(0, 3), LIBRARY[0]] as const;

export function RootLayout() {
  const { newPlaylistOpen, setNewPlaylistOpen } = useSession();
  usePlayerKeys();

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-56 shrink-0 flex-col gap-1 border-r border-border p-4 sm:flex">
          <Link to="/" className="mb-4 flex items-center gap-2">
            <img src="/brand/logo-badge.svg" alt="" className="size-7 dark:hidden" />
            <img src="/brand/logo-badge-dark.svg" alt="" className="hidden size-7 dark:block" />
            <span className="text-sm font-semibold">Kirtan Player</span>
          </Link>

          {MAIN.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              activeProps={{ className: 'bg-accent text-foreground' }}
              activeOptions={{ exact: to === '/' }}>
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
              activeProps={{ className: 'bg-accent text-foreground' }}>
              <Icon className="size-4" />
              {label}
            </Link>
          ))}

          {/* The player carries no editing UI: the archive grows in the
              workbench and the code grows on GitHub, so this is where it says so. */}
          <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
            {/* The one link here that asks something of the reader, rather
                than just offering it — so it is the one that is not grey. */}
            <a
              href={CONTRIBUTE_URL}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10">
              <Users className="size-4" />
              Contribute
            </a>
            <a
              href={GITHUB_URL}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              <Github className="size-4" />
              Source
            </a>
            <div className="flex items-center justify-between px-1">
              <AccountButton />
              <ThemeToggle />
            </div>
          </div>
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="flex items-center justify-end gap-1 px-4 pt-3 sm:hidden">
            <AccountButton />
            <ThemeToggle />
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
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] text-muted-foreground"
            activeProps={{ className: 'text-primary' }}
            activeOptions={{ exact: to === '/' }}>
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
