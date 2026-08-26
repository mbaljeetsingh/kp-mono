<script setup lang="ts">
/**
 * Sign in / sign up, in one dialog.
 *
 * A dialog rather than a `/signin` page because auth here is contextual: it is
 * always reached from something the listener was already doing ("save this",
 * "add to a playlist"), and a route change would lose that place. Mounted once
 * in app.vue; anything can open it through `useAuth().prompt()`.
 */
import { ref, watch } from 'vue';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const auth = useAuth();

const mode = ref<'signin' | 'signup'>('signin');
const email = ref('');
const password = ref('');
const message = ref('');
const busy = ref(false);

// Every open starts clean — a stale error from a mistyped password last time is
// confusing, and a lingering password in a field is worse.
watch(auth.promptOpen, (open) => {
  if (!open) return;
  mode.value = 'signin';
  email.value = '';
  password.value = '';
  message.value = '';
});

async function submit() {
  if (busy.value) return;
  message.value = '';

  if (!email.value.trim() || !password.value) {
    message.value = 'Enter your email and a password.';
    return;
  }

  busy.value = true;
  try {
    if (mode.value === 'signin') {
      const error = await auth.signIn(email.value.trim(), password.value);
      if (error) message.value = error;
    } else {
      const result = await auth.signUp(email.value.trim(), password.value);
      if (result.error) message.value = result.error;
      // Confirmations are off locally, so signup usually signs you straight in
      // and this dialog has already closed. Where they are on, the account
      // exists but there is no session yet, and saying nothing would look like
      // a button that did nothing.
      else if (result.confirm)
        message.value = 'Check your email to confirm the account.';
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Dialog v-model:open="auth.promptOpen.value">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>
          {{ mode === 'signin' ? 'Sign in' : 'Create an account' }}
        </DialogTitle>
        <DialogDescription>
          Listening never needs an account. One keeps your favorites and
          playlists across devices.
        </DialogDescription>
      </DialogHeader>

      <form class="grid gap-3" @submit.prevent="submit">
        <div class="grid gap-1.5">
          <Label for="auth-email">Email</Label>
          <Input
            id="auth-email"
            v-model="email"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
          />
        </div>
        <div class="grid gap-1.5">
          <Label for="auth-password">Password</Label>
          <Input
            id="auth-password"
            v-model="password"
            type="password"
            :autocomplete="
              mode === 'signin' ? 'current-password' : 'new-password'
            "
            placeholder="At least 6 characters"
          />
        </div>

        <p v-if="message" class="text-xs text-amber-600 dark:text-amber-400">
          {{ message }}
        </p>

        <Button type="submit" :disabled="busy" class="mt-1">
          {{
            busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'
          }}
        </Button>
      </form>

      <p class="text-center text-xs text-muted-foreground">
        {{ mode === 'signin' ? 'No account yet?' : 'Already have an account?' }}
        <button
          type="button"
          class="text-foreground underline-offset-2 hover:underline"
          @click="
            mode = mode === 'signin' ? 'signup' : 'signin';
            message = '';
          "
        >
          {{ mode === 'signin' ? 'Create one' : 'Sign in' }}
        </button>
      </p>
    </DialogContent>
  </Dialog>
</template>
