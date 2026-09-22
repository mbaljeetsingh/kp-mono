/**
 * The shell, and the auth gate.
 *
 * `loading` is checked before `session`: "not signed in" and "we do not know
 * yet" render differently, and conflating them flashes the sign-in form at
 * every signed-in contributor on every load.
 */
import { signOut } from '@kp/api';
import { AccountMenu } from '@kp/ui/app/account-menu';
import { ThemeToggle } from '@kp/ui/app/theme-toggle';
import { Link, Outlet } from '@tanstack/react-router';
import { ClipboardCheck, ListChecks, ShieldCheck, Users } from 'lucide-react';

import { SignIn } from '~/components/SignIn';
import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';

const NAV = [
  { to: '/', label: 'Queue', icon: ListChecks },
  { to: '/pending', label: 'Review', icon: ClipboardCheck },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/permissions', label: 'Permissions', icon: ShieldCheck },
] as const;

export function RootLayout() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        Checking your session…
      </div>
    );
  }

  if (!session) return <SignIn />;

  return (
    /*
     * `h-dvh`, not `min-h-dvh` — the player's shell already had this and the
     * workbench did not. Without a fixed height nothing constrains <main>, so
     * its overflow-y-auto never engages and the document scrolls instead: the
     * sidebar stretched to the height of the whole queue (3018px on a full
     * shelf) and `mt-auto` pushed the account footer to the bottom of *that*,
     * two thousand pixels below the fold. Email and Sign out were on every
     * page, just never on screen unless the list was short.
     */
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <nav className="flex w-52 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-4">
        <Link to="/" search={{}} className="mb-4 flex items-center gap-2">
          {/* A pair, now that the workbench has a light mode — it was pinned to
              the dark badge for as long as it was pinned to the dark theme. */}
          <img src="/brand/logo-badge.svg" alt="" className="size-7 dark:hidden" />
          <img src="/brand/logo-badge-dark.svg" alt="" className="hidden size-7 dark:block" />
          <span className="font-display text-lg font-semibold">Contribute</span>
        </Link>

        {NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            search={{}}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            activeProps={{ className: 'bg-accent text-foreground' }}
            activeOptions={{ exact: to === '/' }}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}

        {/* The same account menu the player carries, rather than loose text and
            a bare button: which account the tagging is attributed to matters
            more here than there, and Sign out belongs behind the thing that
            names it rather than beside it. */}
        <div className="mt-auto flex items-center gap-1 border-t border-border pt-3">
          <div className="min-w-0 flex-1">
            <AccountMenu
              email={session.user.email ?? ''}
              onSignOut={() => void signOut(supabase)}
              variant="row"
            />
          </div>
          <ThemeToggle />
        </div>
      </nav>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
