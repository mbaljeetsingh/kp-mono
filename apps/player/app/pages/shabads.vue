<script setup lang="ts">
/**
 * The whole published catalogue, newest first.
 *
 * Home's "Recently added" is a shelf of twenty — it answers "what is new since
 * I was last here", and paging it forever turned the front page into the
 * archive. This is the archive: the same rows, with no ceiling. Search needs a
 * term and Ragis needs a name, so without this there was no way to simply
 * browse what has been tagged.
 *
 * Paged rather than fetched whole, like every other list here: published
 * shabads only number in the hundreds today, and the count is the point of the
 * tagging effort — it is meant to reach the tens of thousands.
 */
const supabase = useSupabaseClient();

const list = useInfiniteList<any>('shabads', async (from, to) => {
  const { data, error } = await supabase
    .from('shabads')
    .select('*')
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) console.error('shabads failed', error.message);
  return data;
});
await list.loadMore();
</script>

<template>
  <div>
    <header class="mb-6">
      <h1 class="text-3xl font-bold text-foreground">All shabads</h1>
      <!-- `+` until the last page has landed: this counts what has been
           fetched, not what exists, and a hard number that grows as you scroll
           is worse than an honest open one. -->
      <p class="mt-1 text-sm text-muted-foreground">
        {{ list.items.value.length }}{{ list.done.value ? '' : '+' }} published,
        newest first
      </p>
    </header>

    <ShabadRow
      v-for="(s, i) in list.items.value"
      :key="s.id"
      :shabad="s"
      :index="i"
      :list="list.items.value"
    />
    <EmptyState
      v-if="!list.items.value.length"
      title="No shabads published yet"
      hint="Tag a few in the admin app and publish them — they appear here immediately."
    />
    <InfiniteScroll
      :loading="list.loading.value"
      :done="list.done.value"
      @more="list.loadMore"
    />
  </div>
</template>
