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
import { useQuery } from '@tanstack/react-query';

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

const NONE: PermissionMap = Object.fromEntries(
  PERMISSIONS.map((p) => [p, false])
) as PermissionMap;

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
