/**
 * The shell, and the auth gate.
 *
 * `loading` is checked before `session`: "not signed in" and "we do not know
 * yet" render differently, and conflating them flashes the sign-in form at
 * every signed-in contributor on every load.
 */
import { signOut } from '@kp/api';
import { Link, Outlet } from '@tanstack/react-router';
import { ClipboardCheck, ListChecks, LogOut, ShieldCheck, Users } from 'lucide-react';

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
    <div className="flex min-h-dvh bg-background text-foreground">
      <nav className="flex w-52 shrink-0 flex-col gap-1 border-r border-border p-4">
        <Link to="/" search={{}} className="mb-4 flex items-center gap-2">
          <img src="/brand/logo-badge-dark.svg" alt="" className="size-7" />
          <span className="text-sm font-semibold">Contribute</span>
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

        <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
          <p className="truncate px-3 text-xs text-muted-foreground">{session.user.email}</p>
          <button
            type="button"
            onClick={() => void signOut(supabase)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
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
