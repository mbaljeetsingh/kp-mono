/**
 * The shell: navigation, the outlet, and a transport that never unmounts.
 *
 * The bar sits outside the outlet deliberately — rendering it inside would
 * remount it on every navigation, which stops playback.
 */
import { Link, Outlet } from '@tanstack/react-router';
import { Disc3, Radio, Search, Users } from 'lucide-react';

import { PlayerBar } from '~/components/PlayerBar';

const NAV = [
  { to: '/', label: 'Shabads', icon: Disc3 },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/ragis', label: 'Ragis', icon: Users },
  { to: '/radio', label: 'Radio', icon: Radio },
] as const;

export function RootLayout() {
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-52 shrink-0 flex-col gap-1 border-r border-border p-4 sm:flex">
          <Link to="/" className="mb-4 flex items-center gap-2">
            <img src="/brand/logo-badge.svg" alt="" className="size-7 dark:hidden" />
            <img src="/brand/logo-badge-dark.svg" alt="" className="hidden size-7 dark:block" />
            <span className="text-sm font-semibold">Kirtan Player</span>
          </Link>

          {NAV.map(({ to, label, icon: Icon }) => (
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
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-4 py-6">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile nav. The sidebar is hidden below sm, so this is the only way
          around on a phone-width browser. */}
      <nav className="flex border-t border-border sm:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
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
    </div>
  );
}
