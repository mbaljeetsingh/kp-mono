<script setup lang="ts">
import { ListMusic, CheckCheck, Users, LogOut } from 'lucide-vue-next';

const supabase = useSupabaseClient();
const email = ref('');
onMounted(async () => {
  const { data } = await supabase.auth.getUser();
  email.value = data.user?.email ?? '';
});

const nav = [
  { to: '/', label: 'Recordings', icon: ListMusic },
  { to: '/pending', label: 'Pending', icon: CheckCheck },
  { to: '/users', label: 'Users', icon: Users },
];
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
        <button
          class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
          @click="supabase.auth.signOut()"
        >
          <LogOut class="size-4 shrink-0" />
          <span class="truncate">{{ email || 'Sign out' }}</span>
        </button>
      </div>
    </aside>

    <div class="min-w-0 flex-1 overflow-y-auto">
      <div class="mx-auto max-w-5xl p-6"><slot /></div>
    </div>
  </div>
</template>
