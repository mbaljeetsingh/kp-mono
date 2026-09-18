/**
 * The permission matrix, read-only here.
 *
 * Shown because "why can't I publish?" is answered by this table, and a
 * contributor who can see the ladder can see what they are working towards.
 */
import { PERMISSIONS, usePermissions, useAuth } from '@kp/api';

import { supabase } from '~/lib/supabase';
import { cn } from '~/lib/utils';

export function PermissionsRoute() {
  const { session } = useAuth(supabase);
  const { can, loading } = usePermissions(supabase, Boolean(session));

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Your permissions</h1>
      <p className="text-sm text-muted-foreground">
        Granted by your trust level. The ladder gates publishing, not participation.
      </p>

      {loading ? <p className="text-sm text-muted-foreground">Checking…</p> : null}

      <div className="flex flex-col gap-0.5">
        {PERMISSIONS.map((permission) => (
          <div
            key={permission}
            className="flex items-center justify-between rounded-lg px-3 py-2">
            <code className="text-sm">{permission}</code>
            <span
              className={cn(
                'text-xs',
                can[permission] ? 'text-primary' : 'text-muted-foreground'
              )}>
              {can[permission] ? 'granted' : '—'}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
