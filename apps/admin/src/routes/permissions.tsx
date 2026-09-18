/**
 * The permission matrix.
 *
 * Editable by anyone holding `users.manage`, read-only for everyone else —
 * because "why can't I publish?" is answered by this table, and a contributor
 * who can see the ladder can see what they are working towards.
 */
import { usePermissions, useRolePermissions, useSetRolePermission, useAuth } from '@kp/api';
import { TRUST_LADDER } from '@kp/shared/types';
import { Switch } from '@kp/ui/switch';
import { Check, Minus } from 'lucide-react';

import { supabase } from '~/lib/supabase';
import { cn } from '~/lib/utils';

export function PermissionsRoute() {
  const { session } = useAuth(supabase);
  const { can, loading } = usePermissions(supabase, Boolean(session));
  const editable = can['users.manage'];

  const { all, granted } = useRolePermissions(supabase, Boolean(session));
  const setPermission = useSetRolePermission(supabase);

  const permissions = all.data ?? [];
  const held = new Set((granted.data ?? []).map((g) => `${g.role}:${g.permission}`));

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Permissions</h1>
        <p className="text-sm text-muted-foreground">
          {editable
            ? 'What each rung of the ladder may do. Changes apply immediately.'
            : 'What each rung of the ladder may do. Your own row is highlighted.'}
        </p>
      </header>

      {loading || all.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      {setPermission.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {setPermission.error instanceof Error
            ? setPermission.error.message
            : 'Could not change that permission'}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-md text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 pr-4 text-left font-medium">Permission</th>
              {TRUST_LADDER.map((role) => (
                <th key={role} className="px-3 py-2 text-center font-medium capitalize">
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permissions.map((permission) => (
              <tr key={permission} className="border-b border-border/50">
                <td className="py-2 pr-4">
                  <code className="text-xs">{permission}</code>
                </td>
                {TRUST_LADDER.map((role) => {
                  const on = held.has(`${role}:${permission}`);
                  // The RPC refuses this one outright — an admin removing their
                  // own ability to manage users would lock the instance out of
                  // its own matrix with no way back in. Said here rather than
                  // letting the server reject a switch that already moved.
                  const locked = role === 'admin' && permission === 'users.manage';

                  return (
                    <td key={role} className="px-3 py-2 text-center">
                      {editable && !locked ? (
                        <Switch
                          checked={on}
                          aria-label={`${permission} for ${role}`}
                          disabled={setPermission.isPending}
                          onCheckedChange={(next) =>
                            setPermission.mutate({
                              role,
                              permission,
                              enabled: Boolean(next),
                            })
                          }
                        />
                      ) : on ? (
                        <Check
                          aria-label="granted"
                          className={cn(
                            'mx-auto size-4',
                            locked ? 'text-muted-foreground' : 'text-primary'
                          )}
                        />
                      ) : (
                        <Minus
                          aria-label="not granted"
                          className="mx-auto size-4 text-muted-foreground/40"
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Admin always keeps <code>users.manage</code> — without it nobody could edit this table
        again.
      </p>
    </section>
  );
}
