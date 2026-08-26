<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ListMusic,
  CheckCheck,
  Users,
  KeyRound,
  LogOut,
  User,
} from 'lucide-vue-next';

const supabase = useSupabaseClient();

// The rung, not the capabilities: the badge names what you are, and the tabs
// below ask separately about what you may do. Both admin-only tabs would open
// to nothing without the permission — list_users and the permission matrix are
// each gated on `users.manage` in the database — so the nav hides them rather
// than offering the trip.
//
// Concurrently, because this blocks first paint and the two ask independent
// questions: awaited one after the other, a cold load spent a whole extra
// round trip staring at nothing.
const [{ email, trust }, { canManageUsers }] = await Promise.all([
  useMyProfile(),
  useMyPermissions(),
]);

const nav = computed(() => [
  { to: '/', label: 'Recordings', icon: ListMusic },
  { to: '/pending', label: 'Pending', icon: CheckCheck },
  ...(canManageUsers.value
    ? [
        { to: '/users', label: 'Users', icon: Users },
        { to: '/permissions', label: 'Permissions', icon: KeyRound },
      ]
    : []),
]);

/** Admin is the only rung worth colouring; the rest are stated, not flagged. */
const trustClass = computed(() =>
  trust.value === 'admin'
    ? 'border-amber-500/30 bg-amber-500/15 text-amber-400'
    : 'border-border bg-muted/40 text-muted-foreground'
);
</script>

<template>
  <div class="flex h-dvh overflow-hidden bg-background text-foreground">
    <aside
      class="hidden w-56 shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar md:flex"
    >
      <div class="flex items-center gap-2.5 px-4 py-4">
        <img src="/brand/logo-badge.svg" alt="" class="size-8 rounded-lg" />
        <span class="text-sm font-semibold">Kirtan Admin</span>
      </div>
      <nav class="flex-1 px-2">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
          active-class="bg-accent !text-foreground"
        >
          <component :is="item.icon" class="size-4" />
          {{ item.label }}
        </NuxtLink>
      </nav>
      <div class="border-t border-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              variant="ghost"
              class="w-full justify-start gap-3 px-3 text-sm font-normal text-muted-foreground"
            >
              <User class="size-4 shrink-0" />
              <span class="truncate">{{ email || 'Account' }}</span>
              <Badge
                v-if="trust"
                variant="outline"
                :class="['ml-auto shrink-0 px-1.5 py-0 text-[10px]', trustClass]"
              >
                {{ trust }}
              </Badge>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" class="w-52">
            <DropdownMenuLabel class="font-normal">
              <span class="block truncate text-xs text-muted-foreground">
                {{ email }}
              </span>
              <span class="mt-1 block text-[11px] text-muted-foreground/70">
                Signed in as <span class="text-foreground">{{ trust }}</span>
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem @select="supabase.auth.signOut()">
              <LogOut class="size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>

    <div class="min-w-0 flex-1 overflow-y-auto">
      <div class="mx-auto max-w-5xl p-6"><slot /></div>
    </div>
  </div>
</template>
