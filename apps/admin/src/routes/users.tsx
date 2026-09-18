/**
 * Accounts and their trust levels.
 *
 * Reads through `admin_users()` rather than `profiles` directly: profiles is
 * not world-readable, because a register of everyone who uses the player is
 * both a privacy leak and a map of who is worth attacking.
 */
import { usePermissions, useAuth } from '@kp/api';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '~/lib/supabase';

interface AdminUser {
  id: string;
  email: string | null;
  display_name: string | null;
  trust: string;
}

export function UsersRoute() {
  const { session } = useAuth(supabase);
  const { can } = usePermissions(supabase, Boolean(session));

  const query = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_users');
      if (error) throw error;
      return (data ?? []) as AdminUser[];
    },
    enabled: can['users.manage'],
  });

  if (!can['users.manage']) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have permission to manage users.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Users</h1>

      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      <div className="flex flex-col gap-0.5">
        {(query.data ?? []).map((user) => (
          <div key={user.id} className="flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{user.display_name ?? user.email ?? user.id}</p>
              {user.display_name && user.email ? (
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              ) : null}
            </div>
            <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs text-muted-foreground">
              {user.trust}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
