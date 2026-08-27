<script setup lang="ts">
/**
 * The permission matrix: which rung of the trust ladder holds which capability.
 *
 * This page is the reason role_permissions is a table rather than a set of
 * conditions inside the policies — granting reviewers the ability to request
 * scans should be a tick here, not a migration. Until 20260826000200 the table
 * had no write policy at all, so it had only ever been the latter.
 *
 * The database is still the boundary, and this page does not touch the table:
 * role_permissions has no INSERT or DELETE policy on purpose — "Writable only
 * through set_role_permission()" (20260804000300_authz.sql) — so every tick and
 * untick goes through that security-definer function, which checks
 * `users.manage` itself. The errors below are its refusals surfaced.
 */
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Lock, LockOpen } from 'lucide-vue-next';
// The ladder comes from @kp/shared, which mirrors the trust_level enum —
// `blocked` is excluded there, for the reason documented alongside it.
import { TRUST_LADDER, type TrustLevel } from '@kp/shared/types';

const supabase = useSupabaseClient();
const { canManageUsers } = await useMyPermissions();

/**
 * Read from the enum rather than a list kept here: a capability added by a
 * migration has to appear in this grid on its own, since an ungranted
 * capability is precisely the cell an admin comes here to tick. `scans.request`
 * arrived that way.
 */
const { data: permissions } = await useAsyncData(
  'app-permissions',
  async () => {
    const { data } = await supabase.rpc('app_permissions');
    return (data as string[] | null) ?? [];
  }
);

const { data: granted, refresh } = await useAsyncData(
  'role-permissions',
  async () => {
    const { data } = await supabase
      .from('role_permissions')
      .select('role,permission');
    return (data ?? []) as { role: string; permission: string }[];
  }
);

const held = computed(() => {
  const s = new Set<string>();
  for (const r of granted.value ?? []) s.add(`${r.role}|${r.permission}`);
  return s;
});

function has(role: TrustLevel, permission: string) {
  return held.value.has(`${role}|${permission}`);
}

/**
 * The one cell that must stay ticked. set_role_permission() raises on it
 * regardless of direction — revoking it would remove the only key to this page,
 * from everyone — so disabling it here just declines to offer a click that ends
 * in an exception.
 */
function locked(role: TrustLevel, permission: string) {
  return role === 'admin' && permission === 'users.manage';
}

/**
 * Locked until deliberately unlocked, as np-mono's matrix does.
 *
 * Every cell here is a live capability for a whole rung of the ladder — one
 * stray click grants or revokes it for every account on that rung, with no
 * confirmation step and no undo beyond ticking it back. The lock is not
 * security (the database is, via set_role_permission), it is the pause between
 * arriving on the page and changing what people can do.
 */
const isEditing = ref(false);

const busy = ref<string | null>(null);
const error = ref('');

async function toggle(role: TrustLevel, permission: string) {
  if (locked(role, permission)) return;
  const cell = `${role}|${permission}`;
  busy.value = cell;
  error.value = '';
  // Enabled is computed from what we last read, not from the checkbox's emitted
  // value: the box is a controlled mirror of `granted`, so its own state is
  // whatever the last refresh said, and reading it back would just be the same
  // answer one layer less directly.
  const { error: e } = await supabase.rpc('set_role_permission', {
    target_role: role,
    target_permission: permission,
    enabled: !has(role, permission),
  });
  if (e) {
    busy.value = null;
    error.value = e.message;
    return;
  }
  // Re-read rather than patch the local set. Not for visibility — this table's
  // SELECT policy is `using (true)`, so a write this session made is always a
  // write it can read back. It is for agreement: the grid is shared state that
  // another admin may be editing in the same minute, and one round trip per
  // tick is a cheap way to never render a matrix the database disagrees with.
  await refresh();
  // Cleared only now. Clearing before the refresh re-enabled the box while it
  // still rendered the pre-write state, so a "that didn't take" second click
  // fired the same toggle again.
  busy.value = null;
}
</script>

<template>
  <div>
    <div class="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 class="mb-1 text-xl font-semibold">Permissions</h1>
        <p class="text-sm text-muted-foreground">
          What each rung of the ladder can do. Changes take effect immediately —
          there is no deploy behind this.
        </p>
      </div>
      <Button
        v-if="canManageUsers"
        :variant="isEditing ? 'default' : 'outline'"
        size="sm"
        class="shrink-0"
        :aria-pressed="isEditing"
        :title="
          isEditing
            ? 'Changes apply as you tick — lock when you are done'
            : 'Unlock to change what each rung can do'
        "
        @click="isEditing = !isEditing"
      >
        <LockOpen v-if="isEditing" class="mr-1.5 size-4" />
        <Lock v-else class="mr-1.5 size-4" />
        {{ isEditing ? 'Editing' : 'Locked' }}
      </Button>
    </div>

    <p v-if="!canManageUsers" class="text-sm text-muted-foreground">
      You need the <code>users.manage</code> capability to change these.
    </p>

    <p v-if="error" class="mb-3 text-xs text-amber-400" role="alert">
      {{ error }}
    </p>

    <div class="overflow-x-auto rounded-md border border-border">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-border bg-muted/30">
            <th class="px-3 py-2 text-left font-medium">Capability</th>
            <th
              v-for="l in TRUST_LADDER"
              :key="l"
              class="px-3 py-2 text-center font-medium capitalize"
            >
              {{ l }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="p in permissions"
            :key="p"
            class="border-b border-border last:border-0"
          >
            <td class="px-3 py-2">
              <code class="text-xs text-foreground">{{ p }}</code>
            </td>
            <td
              v-for="l in TRUST_LADDER"
              :key="l"
              class="px-3 py-2 text-center"
            >
              <div class="flex justify-center">
                <Checkbox
                  :model-value="has(l, p)"
                  :disabled="
                    !canManageUsers ||
                    !isEditing ||
                    locked(l, p) ||
                    busy === `${l}|${p}`
                  "
                  :aria-label="`${p} for ${l}`"
                  :title="
                    locked(l, p)
                      ? 'Admin must keep users.manage — revoking it would lock everyone out of this page'
                      : undefined
                  "
                  @update:model-value="toggle(l, p)"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="mt-3 text-[11px] text-muted-foreground/70">
      <Badge variant="outline" class="mr-1 px-1.5 py-0 text-[10px]">
        blocked
      </Badge>
      is not shown: it holds nothing by design — the absence of every grant is
      what blocks the account.
    </p>
  </div>
</template>
