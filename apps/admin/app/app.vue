<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const supabase = useSupabaseClient();
const session = ref<any>(null);
const ready = ref(false);
const email = ref('');
const password = ref('');
const message = ref('');

onMounted(async () => {
  const { data } = await supabase.auth.getSession();
  session.value = data.session;
  ready.value = true;
  supabase.auth.onAuthStateChange((_e, s) => (session.value = s));
});

async function signIn() {
  message.value = '';
  const { error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  });
  if (error) message.value = error.message;
}

// Contributors sign themselves up and can propose immediately — the trust
// ladder gates publishing, not participation.
async function signUp() {
  message.value = '';
  const { error } = await supabase.auth.signUp({
    email: email.value,
    password: password.value,
  });
  message.value = error
    ? error.message
    : 'Account created — sign in to start tagging.';
}
</script>

<template>
  <div class="dark h-dvh bg-background">
    <div
      v-if="!ready"
      class="grid h-dvh place-items-center bg-background text-sm text-muted-foreground"
    >
      Loading…
    </div>

    <div
      v-else-if="!session"
      class="grid h-dvh place-items-center bg-background px-4"
    >
      <div class="w-full max-w-sm">
        <div class="mb-6 flex items-center gap-2.5">
          <img src="/brand/logo-badge.svg" alt="" class="size-9 rounded-lg" />
          <div>
            <p class="text-sm font-semibold text-foreground">Kirtan Admin</p>
            <p class="text-xs text-muted-foreground">Tagging workbench</p>
          </div>
        </div>
        <Input
          v-model="email"
          type="email"
          placeholder="Email"
          class="mb-2 bg-card"
        />
        <Input
          v-model="password"
          type="password"
          placeholder="Password"
          class="mb-3 bg-card"
          @keyup.enter="signIn"
        />
        <div class="flex gap-2">
          <Button class="flex-1" @click="signIn">Sign in</Button>
          <Button variant="outline" class="flex-1" @click="signUp">
            Sign up
          </Button>
        </div>
        <p v-if="message" class="mt-3 text-xs text-amber-400">{{ message }}</p>
      </div>
    </div>

    <NuxtLayout v-else>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
