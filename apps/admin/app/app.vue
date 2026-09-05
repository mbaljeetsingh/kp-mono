<script setup lang="ts">
const supabase = useSupabaseClient();
const session = ref<any>(null);
const ready = ref(false);

onMounted(async () => {
  const { data } = await supabase.auth.getSession();
  session.value = data.session;
  ready.value = true;
  supabase.auth.onAuthStateChange((_e, s) => {
    // Who is signed in changed, so everything keyed to that identity is stale.
    // The admin is ssr:false, so signing out and back in as someone else never
    // reloads the page: without this the sidebar kept the previous account's
    // email and rung, and — since the nav is now gated on `users.manage` — the
    // previous account's tabs.
    const changedUser = s?.user?.id !== session.value?.user?.id;
    session.value = s;
    if (changedUser) {
      refreshNuxtData([
        'my-profile',
        'my-perms',
        'app-permissions',
        'role-permissions',
      ]);
    }
  });
});
</script>

<template>
  <!-- `dark` lives on <html>, set in nuxt.config: portalled overlays would miss
       it here. -->
  <div class="h-dvh bg-background">
    <div
      v-if="!ready"
      class="grid h-dvh place-items-center bg-background text-sm text-muted-foreground"
    >
      Loading…
    </div>

    <!-- The panel owns the form and talks to Supabase itself; this stays a
         session gate. The listener above swaps it out the moment one exists. -->
    <SignInPanel v-else-if="!session" />

    <NuxtLayout v-else>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
