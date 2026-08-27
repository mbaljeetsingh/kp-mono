<script setup lang="ts">
/**
 * The whole account surface: sign in, or the email with a way out.
 *
 * Deliberately one small control. The player stores nothing about an account
 * beyond what that account has saved, so there is no profile to edit.
 *
 * Desktop only, in practice: the sidebar is the one place it renders. On touch
 * the same two states — the email with a way out, or a way in — are rows inside
 * MobileTabBar's More sheet, since there is no sidebar to hold this.
 */
import { LogIn, LogOut, User } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const auth = useAuth();

const trigger =
  'w-full justify-start gap-3 px-3 text-sm font-normal text-muted-foreground';
</script>

<template>
  <!-- `ready` is false through SSR and until the stored session has been read,
       and this renders nothing until then. Showing the signed-out state first
       would flash "Sign in" at someone who is already signed in. -->
  <template v-if="auth.ready.value">
    <DropdownMenu v-if="auth.user.value">
      <DropdownMenuTrigger as-child>
        <Button variant="ghost" :class="trigger">
          <User class="size-[18px] shrink-0" />
          <span class="truncate">{{ auth.user.value.email }}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" class="w-56">
        <DropdownMenuLabel
          class="truncate text-xs font-normal text-muted-foreground"
        >
          {{ auth.user.value.email }}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem @select="auth.signOut()">
          <LogOut class="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <Button v-else variant="ghost" :class="trigger" @click="auth.prompt()">
      <LogIn class="size-[18px] shrink-0" />
      Sign in
    </Button>
  </template>
</template>
