/**
 * What this account may actually do, asked one permission at a time.
 *
 * Gating everything on a single "is reviewer" check is what this replaces, and
 * it was wrong in a specific way: `trusted` holds `renditions.publish` without
 * `renditions.review`, so RLS would accept a trusted tagger publishing their
 * own draft while the UI showed them a read-only badge and no button. Delete is
 * a third permission again.
 *
 * Asked through the `authorize` RPC so the answer comes from the same
 * role_permissions table RLS consults — a second copy of the matrix in the
 * client is a second thing to keep in step.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { KpClient } from './client';

export const PERMISSIONS = [
  'renditions.propose',
  'renditions.review',
  'renditions.publish',
  'renditions.delete',
  'users.manage',
  'scans.request',
  'tracks.mark_done',
  'artists.edit',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type PermissionMap = Record<Permission, boolean>;

const NONE: PermissionMap = Object.fromEntries(PERMISSIONS.map((p) => [p, false])) as PermissionMap;

export async function fetchPermissions(client: KpClient): Promise<PermissionMap> {
  const answers = await Promise.all(
    PERMISSIONS.map(async (requested) => {
      const { data } = await client.rpc('authorize', { requested });
      return [requested, data === true] as const;
    })
  );
  return Object.fromEntries(answers) as PermissionMap;
}

/**
 * Cached under one key so the round trips happen once per session rather than
 * once per page. Signed out, nobody may do anything — asked or not.
 */
export function usePermissions(client: KpClient, signedIn: boolean) {
  const query = useQuery({
    queryKey: ['permissions'],
    queryFn: () => fetchPermissions(client),
    enabled: signedIn,
    staleTime: Infinity,
  });

  return {
    can: query.data ?? NONE,
    /** Distinct from "may do nothing" — a control must not flash before we know. */
    loading: signedIn && query.isLoading,
  };
}

/* ── The matrix, for the admin app ────────────────────────────────────── */

/**
 * Every permission the enum defines, asked of the database rather than listed
 * here. A client-side copy is one migration away from being wrong, and the one
 * place it would be wrong is the screen that explains the ladder.
 */
export async function fetchAllPermissions(client: KpClient): Promise<string[]> {
  const { data, error } = await client.rpc('app_permissions');
  if (error) throw error;
  return (data as string[]) ?? [];
}

export interface RolePermission {
  role: string;
  permission: string;
}

export async function fetchRolePermissions(client: KpClient): Promise<RolePermission[]> {
  const { data, error } = await client.from('role_permissions').select('role,permission');
  if (error) throw error;
  return (data ?? []) as RolePermission[];
}

export function useRolePermissions(client: KpClient, enabled: boolean) {
  const all = useQuery({
    queryKey: ['app-permissions'],
    queryFn: () => fetchAllPermissions(client),
    enabled,
    staleTime: Infinity,
  });
  const granted = useQuery({
    queryKey: ['role-permissions'],
    queryFn: () => fetchRolePermissions(client),
    enabled,
  });
  return { all, granted };
}

/**
 * Toggle one cell of the matrix.
 *
 * Goes through the RPC, not a table write: it is gated on `users.manage` and it
 * refuses to strip `users.manage` from `admin`, which would lock the instance
 * out of its own permission matrix with no way back in.
 */
export function useSetRolePermission(client: KpClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { role: string; permission: string; enabled: boolean }) => {
      const { error } = await client.rpc('set_role_permission', {
        target_role: vars.role,
        target_permission: vars.permission,
        enabled: vars.enabled,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['role-permissions'] });
      // The signed-in account's own answers come from the same table.
      void queryClient.invalidateQueries({ queryKey: ['permissions'] });
    },
  });
}

/* ── Accounts ─────────────────────────────────────────────────────────── */

export interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
  trust: string;
  created_at: string;
  published: number;
}

/**
 * `admin_users()` rather than a `profiles` select: the email is the only handle
 * most accounts have — display names are optional and rarely set — and it lives
 * in `auth.users`, which no client role may read. The function is security
 * definer and gated on `users.manage`, so it returns nothing to anyone else.
 */
export async function fetchAdminUsers(client: KpClient): Promise<AdminUser[]> {
  const { data, error } = await client.rpc('admin_users');
  if (error) throw error;
  return (data as AdminUser[]) ?? [];
}

export function useAdminUsers(client: KpClient, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-users'],
    queryFn: () => fetchAdminUsers(client),
    enabled,
  });
}

/**
 * Trust goes through `set_trust()`, not a table write: `authenticated` has no
 * UPDATE grant on the `trust` column, precisely so a contributor cannot PATCH
 * their own row to admin. The function additionally refuses self-changes.
 */
export function useSetTrust(client: KpClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { target: string; level: string }) => {
      const { error } = await client.rpc('set_trust', {
        target: vars.target,
        level: vars.level,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}
