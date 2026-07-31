<script setup lang="ts">
const supabase = useSupabaseClient();
const session = ref<any>(null);
const ready = ref(false);
const email = ref('');
const password = ref('');
const error = ref('');

onMounted(async () => {
  const { data } = await supabase.auth.getSession();
  session.value = data.session;
  ready.value = true;
  supabase.auth.onAuthStateChange((_e, s) => (session.value = s));
});

async function signIn() {
  error.value = '';
  const { error: e } = await supabase.auth.signInWithPassword({
    email: email.value, password: password.value,
  });
  if (e) error.value = e.message;
}

// Contributors sign themselves up and can propose immediately — the trust
// ladder gates publishing, not participation.
async function signUp() {
  error.value = '';
  const { error: e } = await supabase.auth.signUp({
    email: email.value, password: password.value,
  });
  if (e) error.value = e.message;
  else error.value = 'Account created — check Mailpit (:54324) to confirm, or sign in.';
}
</script>

<template>
  <div class="min-h-screen bg-neutral-950 text-neutral-100">
    <div v-if="!ready" class="p-8 text-sm text-neutral-500">Loading…</div>

    <div v-else-if="!session" class="mx-auto max-w-sm px-4 py-20">
      <h1 class="text-lg">Kirtan Admin</h1>
      <p class="mt-1 mb-6 text-sm text-neutral-500">Tagging workbench</p>
      <input v-model="email" type="email" placeholder="Email"
        class="mb-2 w-full rounded bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm">
      <input v-model="password" type="password" placeholder="Password"
        class="mb-3 w-full rounded bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm">
      <div class="flex gap-2">
        <button class="flex-1 rounded bg-neutral-100 px-3 py-2 text-sm text-neutral-900" @click="signIn">Sign in</button>
        <button class="flex-1 rounded border border-neutral-700 px-3 py-2 text-sm" @click="signUp">Sign up</button>
      </div>
      <p v-if="error" class="mt-3 text-xs text-amber-400">{{ error }}</p>
    </div>

    <div v-else>
      <header class="border-b border-neutral-800">
        <nav class="mx-auto max-w-5xl flex items-center gap-6 px-4 py-3 text-sm">
          <NuxtLink to="/" class="font-semibold">Admin</NuxtLink>
          <span class="ml-auto text-xs text-neutral-500">{{ session.user.email }}</span>
          <button class="text-xs text-neutral-400 hover:text-neutral-100" @click="supabase.auth.signOut()">Sign out</button>
        </nav>
      </header>
      <main class="mx-auto max-w-5xl px-4 py-6"><NuxtPage /></main>
    </div>
  </div>
</template>
