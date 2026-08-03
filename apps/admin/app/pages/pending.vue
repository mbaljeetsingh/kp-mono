<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Trash2, Play } from 'lucide-vue-next';

const supabase = useSupabaseClient();

// Everything a contributor proposes lands here. Nothing reaches the player
// until a reviewer publishes it, which is the only thing the trust ladder gates.
const { data: pending, refresh } = await useAsyncData('pending', async () => {
  const { data } = await supabase
    .from('renditions')
    .select('*, tracks(artist_dir, date, url, raw_filename)')
    .neq('status', 'published')
    .order('created_at', { ascending: true })
    .limit(100);
  return data;
});

const { data: canPublish } = await useAsyncData('can-publish', async () => {
  const { data } = await supabase.rpc('is_reviewer');
  return data === true;
});

const error = ref('');
const audio = ref<HTMLAudioElement | null>(null);

// Created in JS rather than bound to the template, so nothing tears it down
// on navigation — without this a preview keeps playing after the reviewer has
// left the page, with no UI left to stop it.
onUnmounted(() => audio.value?.pause());
function preview(s: any) {
  if (!audio.value) audio.value = new Audio();
  audio.value.src = s.tracks.url;
  audio.value.currentTime = Number(s.start_sec);
  void audio.value.play();
}

async function publish(s: any) {
  error.value = '';
  // `select('id')` is what makes a refused write visible: RLS filters rows out
  // of an UPDATE rather than rejecting it, so without asking for the changed
  // rows back this returns 204 with no error and the row quietly stays put.
  const { data, error: updateError } = await supabase
    .from('renditions')
    .update({ status: 'published' })
    .eq('id', s.id)
    .select('id');
  if (updateError) error.value = updateError.message;
  else if (!data?.length) error.value = 'Not permitted to publish that one.';
  await refresh();
}
async function reject(s: any) {
  error.value = '';
  // Same silent-refusal trap as publish: a DELETE that RLS declines returns
  // no error and no rows.
  const { data, error: deleteError } = await supabase
    .from('renditions')
    .delete()
    .eq('id', s.id)
    .select('id');
  if (deleteError) error.value = deleteError.message;
  else if (!data?.length) error.value = 'Not permitted to reject that one.';
  await refresh();
}
function fmt(v: number) {
  const m = Math.floor(v / 60),
    sec = Math.floor(v % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
</script>

<template>
  <div>
    <h1 class="mb-1 text-xl font-semibold">Review</h1>
    <p class="mb-5 text-sm text-muted-foreground">
      {{ pending?.length ?? 0 }} segment{{ pending?.length === 1 ? '' : 's' }}
      waiting. Publishing makes them visible in the player.
    </p>

    <p
      v-if="!canPublish"
      class="rounded-md border border-border p-4 text-sm text-muted-foreground"
    >
      Your account can propose segments but not publish them. A reviewer will
      approve your work.
    </p>

    <p v-if="error" class="mb-2 text-xs text-amber-400">{{ error }}</p>

    <!-- The row is a link into the tagging workbench, opened on this very
         rendition: reviewing means checking boundaries and the shabad link,
         which only that page can do. The buttons inside stop the click from
         bubbling to the link, so preview and publish stay one click too. -->
    <NuxtLink
      v-for="s in pending ?? []"
      :key="s.id"
      :to="`/tag/${s.track_id}?rendition=${s.id}`"
      class="flex items-center gap-3 rounded-md px-3 py-2.5 transition hover:bg-accent"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        class="size-7 text-muted-foreground"
        title="Preview from the start boundary"
        @click.stop.prevent="preview(s)"
      >
        <Play class="size-3.5" />
      </Button>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm">{{ s.name }}</span>
        <span class="block truncate text-[11px] text-muted-foreground">
          {{
            [
              s.tracks?.artist_dir,
              s.tracks?.date,
              s.raag,
              // 'manual' is the norm, so only the exception is worth a word —
              // a scan suggestion earns a closer look at its boundaries.
              s.source !== 'manual' ? s.source : null,
            ]
              .filter(Boolean)
              .join(' · ')
          }}
        </span>
      </span>
      <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
        {{ fmt(Number(s.start_sec)) }}–{{ fmt(Number(s.end_sec)) }}
      </span>
      <Badge variant="secondary" class="shrink-0 rounded-full text-[11px]">
        {{ s.status }}
      </Badge>
      <template v-if="canPublish">
        <Button
          variant="ghost"
          size="icon-sm"
          class="size-7 text-emerald-400"
          title="Publish"
          @click.stop.prevent="publish(s)"
        >
          <Check class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          class="size-7 text-muted-foreground hover:text-destructive"
          title="Reject"
          @click.stop.prevent="reject(s)"
        >
          <Trash2 class="size-3.5" />
        </Button>
      </template>
    </NuxtLink>

    <p
      v-if="!pending?.length"
      class="py-16 text-center text-sm text-muted-foreground"
    >
      Nothing waiting for review.
    </p>
  </div>
</template>
