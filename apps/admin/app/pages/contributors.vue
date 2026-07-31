<script setup lang="ts">
const supabase = useSupabaseClient();

const { data: people, refresh } = await useAsyncData(
  'contributors',
  async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true });
    return data;
  }
);

const { data: canManage } = await useAsyncData('can-manage', async () => {
  const { data } = await supabase.rpc('is_reviewer');
  return data === true;
});

// One earned ladder. Task preference is separate and multi-select — it routes
// work and grants nothing, which is why it isn't edited here.
const LEVELS = ['contributor', 'trusted', 'reviewer', 'admin'] as const;

async function setTrust(person: any, trust: string) {
  await supabase.from('profiles').update({ trust }).eq('id', person.id);
  await refresh();
}
</script>

<template>
  <div>
    <h1 class="mb-1 text-xl font-semibold">Contributors</h1>
    <p class="mb-5 text-sm text-muted-foreground">
      Anyone may sign up and propose. Only reviewers and admins can publish.
    </p>

    <div
      v-for="p in people ?? []"
      :key="p.id"
      class="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-accent"
    >
      <span class="min-w-0 flex-1 truncate text-sm">
        {{ p.display_name || p.id.slice(0, 8) }}
      </span>
      <select
        v-if="canManage"
        :value="p.trust"
        class="rounded-md border border-input bg-card px-2 py-1 text-xs outline-none"
        @change="setTrust(p, ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="l in LEVELS" :key="l" :value="l">{{ l }}</option>
      </select>
      <span v-else class="text-xs text-muted-foreground">{{ p.trust }}</span>
    </div>
  </div>
</template>
