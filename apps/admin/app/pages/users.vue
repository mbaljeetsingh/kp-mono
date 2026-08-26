<script setup lang="ts">
import { Search } from 'lucide-vue-next';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
// Explicit: @vueuse/nuxt auto-imports the composables, not the plain helpers.
import { formatTimeAgo } from '@vueuse/core';
const supabase = useSupabaseClient();

// `admin_users()` rather than a `profiles` select: the email is the only handle
// most accounts have — display names are optional and rarely set — and it lives
// in `auth.users`, which no client role may read. The function is security
// definer and gated on `users.manage`, so it returns nothing to anyone else;
// email is deliberately not a column on the public `profiles` table.
const { data: people, refresh } = await useAsyncData(
  'contributors',
  async () => {
    const { data } = await supabase.rpc('admin_users');
    return (data ?? []) as {
      id: string;
      email: string;
      display_name: string | null;
      trust: string;
      created_at: string;
      published: number;
    }[];
  }
);

// The permission, not the role that currently holds it. `trust === 'admin'` was
// the same answer by coincidence — admin is the only level granted
// `users.manage` today — but it hardcoded a row of role_permissions into the
// client, so granting the permission to reviewers would have silently failed to
// show them this control.
const { canManageUsers } = await useMyPermissions();

// One earned ladder. Task preference is separate and multi-select — it routes
// work and grants nothing, which is why it isn't edited here.
const LEVELS = ['contributor', 'trusted', 'reviewer', 'admin'] as const;

/** What each rung adds, mirroring role_permissions. */
const GRANTS: Record<(typeof LEVELS)[number], string> = {
  contributor: 'propose shabads',
  trusted: '+ publish their own',
  reviewer: '+ publish, edit and delete anyone’s',
  admin: '+ manage users, request scans',
};

const error = ref('');

/**
 * `created_at` was fetched and never shown, and it answers the question behind
 * every promotion: is this a new account or a long-standing one?
 *
 * Relative, via VueUse's pure `formatTimeAgo` — "3 months ago" is read at a
 * glance where "31 Jul 2026" has to be subtracted from today first. The exact
 * date goes in the title for when precision actually matters. Pure rather than
 * the `useTimeAgo` ref because this renders once per row.
 */
function joined(iso: string) {
  return formatTimeAgo(new Date(iso));
}

// Filtered in memory rather than in Postgres: the whole contributor list is one
// small request and already loaded, so a round trip per keystroke would buy
// nothing. Worth revisiting past a few hundred accounts.
const q = ref('');
const levelFilter = ref<'all' | (typeof LEVELS)[number]>('all');

const shown = computed(() => {
  const term = q.value.trim().toLowerCase();
  return (people.value ?? []).filter((p: any) => {
    if (levelFilter.value !== 'all' && p.trust !== levelFilter.value)
      return false;
    if (!term) return true;
    // Id searchable too: it is what an error log or a `created_by` column gives
    // you when you need to find out whose account it is.
    return (
      (p.email ?? '').toLowerCase().includes(term) ||
      (p.display_name ?? '').toLowerCase().includes(term) ||
      p.id.toLowerCase().includes(term)
    );
  });
});

// Trust goes through set_trust(), not a table write: `authenticated` has no
// UPDATE grant on the `trust` column, precisely so a contributor cannot PATCH
// their own row to admin. The function additionally refuses self-changes.
async function setTrust(person: any, trust: string) {
  error.value = '';
  const { error: e } = await supabase.rpc('set_trust', {
    target: person.id,
    level: trust,
  });
  if (e) error.value = e.message;
  await refresh();
}
</script>

<template>
  <div>
    <!-- "Users", matching the sidebar entry that leads here. The count sits with
         the heading rather than out by the filters: it describes the list, and
         it reads as a filtered fraction only while a filter is on. -->
    <h1 class="mb-1 text-xl font-semibold">
      Users
      <span class="text-sm font-normal text-muted-foreground">
        <template v-if="shown.length !== (people?.length ?? 0)">
          {{ shown.length }} of {{ people?.length ?? 0 }}
        </template>
        <template v-else>({{ people?.length ?? 0 }})</template>
      </span>
    </h1>
    <p class="mb-2 text-sm text-muted-foreground">
      Anyone may sign up and propose. Only reviewers and admins can publish.
    </p>
    <!-- The ladder is cumulative and its names do not say what they grant, so
         the levels are spelled out where the choice is made rather than left in
         role_permissions for an admin to remember. -->
    <dl
      class="mb-5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground"
    >
      <div v-for="l in LEVELS" :key="l" class="flex gap-1.5">
        <dt class="text-foreground">{{ l }}</dt>
        <dd class="text-muted-foreground/70">{{ GRANTS[l] }}</dd>
      </div>
    </dl>

    <p v-if="error" class="mb-3 text-xs text-amber-400">{{ error }}</p>

    <div class="mb-3 flex flex-wrap items-center gap-2">
      <div class="relative min-w-56 flex-1">
        <Search
          class="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          v-model="q"
          type="search"
          placeholder="Search by email, name or id"
          class="h-9 bg-card pl-9 text-xs"
        />
      </div>
      <NativeSelect v-model="levelFilter" class="w-auto bg-card text-xs">
        <option value="all">All levels</option>
        <option v-for="l in LEVELS" :key="l" :value="l">{{ l }}</option>
      </NativeSelect>
    </div>

    <div
      v-for="p in shown"
      :key="p.id"
      class="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-accent"
    >
      <span class="min-w-0 flex-1">
        <!-- Email leads, because it is the handle that exists for every account;
             a display name is optional and usually absent. -->
        <span class="block truncate text-sm">
          {{ p.email || p.display_name || p.id.slice(0, 8) }}
        </span>
        <span class="block truncate text-[11px] text-muted-foreground">
          <template v-if="p.display_name">{{ p.display_name }} · </template>
          {{ p.published }} published
          <template v-if="p.created_at">
            ·
            <span :title="new Date(p.created_at).toLocaleString()">
              joined {{ joined(p.created_at) }}
            </span>
          </template>
        </span>
      </span>
      <!-- `model-value`, not `value`: NativeSelect puts v-model on the <select>,
           and that wins over a passed-through value attribute — which is why
           every row rendered with no level selected. -->
      <NativeSelect
        v-if="canManageUsers"
        :model-value="p.trust"
        class="w-auto bg-card text-xs"
        :aria-label="`Trust level for ${p.email || p.id}`"
        @update:model-value="(v) => setTrust(p, String(v))"
      >
        <option v-for="l in LEVELS" :key="l" :value="l">{{ l }}</option>
      </NativeSelect>
      <span v-else class="text-xs text-muted-foreground">{{ p.trust }}</span>
    </div>

    <p
      v-if="!shown.length"
      class="py-10 text-center text-xs text-muted-foreground"
    >
      No users match that.
    </p>
  </div>
</template>
