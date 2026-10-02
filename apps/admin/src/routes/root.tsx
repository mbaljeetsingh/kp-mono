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
import { Button } from '@kp/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@kp/ui/sheet';
import { Link, Outlet } from '@tanstack/react-router';
import { ClipboardCheck, ListChecks, Menu, ShieldCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { useMediaQuery } from 'usehooks-ts';

import { SignIn } from '~/components/SignIn';
import { TrustLadder } from '~/components/TrustLadder';
import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';

const NAV = [
  { to: '/', label: 'Queue', icon: ListChecks },
  { to: '/pending', label: 'Review', icon: ClipboardCheck },
  // Only for those who can manage users: for anyone else the page is a dead
  // end that says so. Permissions likewise — it was left up for everyone as
  // the way a contributor saw what the next rung unlocks, and the trust-ladder
  // card in this sidebar now says that directly. The route stays reachable
  // (read-only) for anyone who has the link.
  { to: '/users', label: 'Users', icon: Users, permission: 'users.manage' },
  { to: '/permissions', label: 'Permissions', icon: ShieldCheck, permission: 'users.manage' },
] as const;

export function RootLayout() {
  const { session, loading } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  // md, as in the classes below. Hiding the drawer at md is not closing it: its
  // backdrop and focus trap outlive a rotation to landscape, blurring a page
  // nobody can click until Escape.
  const wide = useMediaQuery('(min-width: 768px)');

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
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground md:flex-row">
      <nav className="hidden w-52 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-4 md:flex">
        <Sidebar email={session.user.email ?? ''} />
      </nav>

      {/* Below md the sidebar's 208px left a phone ~170px for the queue, so it
          becomes an overlay behind a menu button: same contents, nothing
          dropped, closed again by any link in it. */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-2 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
        >
          <Menu />
        </Button>
        <Brand />
      </header>
      <Sheet open={menuOpen && !wide} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-64 gap-1 p-4 md:hidden">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Sidebar email={session.user.email ?? ''} onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-4 md:px-6 md:py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link to="/" search={{}} onClick={onNavigate} className="flex items-center gap-2">
      {/* A pair, now that the workbench has a light mode — it was pinned to
          the dark badge for as long as it was pinned to the dark theme. */}
      <img src="/brand/logo-badge.svg" alt="" className="size-7 dark:hidden" />
      <img src="/brand/logo-badge-dark.svg" alt="" className="hidden size-7 dark:block" />
      <span className="font-display text-lg font-semibold">Contribute</span>
    </Link>
  );
}

/** The sidebar's contents: the column at md and up, the sheet below it. */
function Sidebar({ email, onNavigate }: { email: string; onNavigate?: () => void }) {
  const { can } = useSession();
  return (
    <>
      <div className="mb-4">
        <Brand onNavigate={onNavigate} />
      </div>

      {NAV.filter((item) => !('permission' in item) || can[item.permission]).map(
        ({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            search={{}}
            onClick={onNavigate}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            activeProps={{ className: 'bg-accent text-foreground' }}
            activeOptions={{ exact: to === '/' }}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        )
      )}

      <div className="mt-auto pb-3">
        <TrustLadder />
      </div>
      {/* The same account menu the player carries, rather than loose text and
          a bare button: which account the tagging is attributed to matters
          more here than there, and Sign out belongs behind the thing that
          names it rather than beside it. */}
      <div className="flex items-center gap-1 border-t border-border pt-3">
        <div className="min-w-0 flex-1">
          <AccountMenu email={email} onSignOut={() => void signOut(supabase)} variant="row" />
        </div>
        <ThemeToggle />
      </div>
    </>
  );
}
