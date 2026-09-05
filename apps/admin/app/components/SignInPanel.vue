<script setup lang="ts">
/**
 * Sign in / create an account, on the page rather than in a dialog.
 *
 * The same shape as the player's AuthDialog, minus the dialog: the player
 * reaches auth from something a listener was already doing, so it must not
 * lose their place, while admin has no signed-out surface at all — this panel
 * IS the app until there is a session. So there is nothing to close and no
 * `promptOpen` to own; app.vue's auth listener swaps this out for the layout
 * the moment a session exists.
 *
 * One mode at a time, and the mode is stated three times over — heading,
 * button label, and the toggle underneath. Two equal buttons reading
 * "Sign in" and "Sign up" over one set of fields could not say which one the
 * form was for, which is the whole reason this replaced them.
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const supabase = useSupabaseClient();

const mode = ref<'signin' | 'signup'>('signin');
const email = ref('');
const password = ref('');
const busy = ref(false);

/**
 * Errors and confirmations share this slot but not their colour. Admin's amber
 * means "someone has to come back to this" everywhere else in the app, and
 * "check your email" is the opposite — it is the only instruction a new
 * account gets, on a screen with nothing else on it.
 */
const notice = ref<{ text: string; kind: 'error' | 'info' } | null>(null);

function toggleMode() {
  mode.value = mode.value === 'signin' ? 'signup' : 'signin';
  // The message belonged to the mode being left — a wrong-password error makes
  // no sense over a signup form. The fields do not: someone who typed their
  // email, then realised they have no account yet, should not have to type it
  // again.
  notice.value = null;
}

async function submit() {
  if (busy.value) return;
  notice.value = null;

  if (!email.value.trim() || !password.value) {
    notice.value = { text: 'Enter your email and a password.', kind: 'error' };
    return;
  }

  busy.value = true;
  try {
    if (mode.value === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.value.trim(),
        password: password.value,
      });
      if (error) notice.value = { text: error.message, kind: 'error' };
      // No success branch: app.vue's onAuthStateChange has already replaced
      // this panel with the workbench.
    } else {
      // Contributors sign themselves up and can propose immediately — the
      // trust ladder gates publishing, not participation.
      const { data, error } = await supabase.auth.signUp({
        email: email.value.trim(),
        password: password.value,
      });
      if (error) notice.value = { text: error.message, kind: 'error' };
      // Confirmations are off locally, so signup usually returns a session and
      // signs them straight in. Where they are on there is no session yet, and
      // the account exists but nothing on screen would have changed — which
      // reads as a button that did nothing.
      else if (!data.session)
        notice.value = {
          text: 'Account created. Check your email to confirm it, then sign in.',
          kind: 'info',
        };
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="grid h-dvh place-items-center bg-background px-4">
    <div class="w-full max-w-sm">
      <div class="mb-6 flex items-center gap-2.5">
        <img src="/brand/logo-badge.svg" alt="" class="size-9 rounded-lg" />
        <div>
          <p class="text-sm font-semibold text-foreground">
            Kirtan Player Admin
          </p>
          <p class="text-xs text-muted-foreground">Tagging workbench</p>
        </div>
      </div>

      <h1 class="text-lg font-semibold text-foreground">
        {{ mode === 'signin' ? 'Sign in' : 'Create an account' }}
      </h1>
      <p class="mb-5 mt-1 text-sm text-muted-foreground">
        Anyone can sign up and start tagging right away — the trust ladder gates
        publishing, not taking part.
      </p>

      <!-- A real form, so Enter submits whichever mode is showing and a
           password manager can see a login it recognises. The old screen bound
           Enter to signIn outright, which fired the wrong action for anyone
           halfway through signing up. -->
      <form class="grid gap-3" @submit.prevent="submit">
        <div class="grid gap-1.5">
          <Label for="auth-email">Email</Label>
          <Input
            id="auth-email"
            v-model="email"
            type="email"
            autocomplete="email"
            autofocus
            placeholder="you@example.com"
            class="bg-card"
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
            :placeholder="
              mode === 'signup' ? 'At least 6 characters' : undefined
            "
            class="bg-card"
          />
        </div>

        <p
          v-if="notice"
          class="text-xs"
          :class="
            notice.kind === 'error' ? 'text-amber-400' : 'text-emerald-400'
          "
          role="status"
        >
          {{ notice.text }}
        </p>

        <Button type="submit" :disabled="busy" class="mt-1">
          {{
            busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'
          }}
        </Button>
      </form>

      <p class="mt-4 text-center text-xs text-muted-foreground">
        {{ mode === 'signin' ? 'No account yet?' : 'Already have an account?' }}
        <button
          type="button"
          class="text-foreground underline-offset-2 hover:underline"
          @click="toggleMode"
        >
          {{ mode === 'signin' ? 'Create one' : 'Sign in' }}
        </button>
      </p>
    </div>
  </div>
</template>
