<script setup lang="ts">
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
  await supabase
    .from('renditions')
    .update({ status: 'published' })
    .eq('id', s.id);
  await refresh();
}
async function reject(s: any) {
  await supabase.from('renditions').delete().eq('id', s.id);
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

    <div
      v-for="s in pending ?? []"
      :key="s.id"
      class="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-accent"
    >
      <button
        class="text-muted-foreground hover:text-foreground"
        @click="preview(s)"
      >
        <Play class="size-3.5" />
      </button>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm">{{ s.name }}</span>
        <span class="block truncate text-[11px] text-muted-foreground">
          {{
            [s.tracks?.artist_dir, s.tracks?.date, s.raag]
              .filter(Boolean)
              .join(' · ')
          }}
        </span>
      </span>
      <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
        {{ fmt(Number(s.start_sec)) }}–{{ fmt(Number(s.end_sec)) }}
      </span>
      <template v-if="canPublish">
        <button
          class="text-emerald-400 hover:text-emerald-300"
          title="Publish"
          @click="publish(s)"
        >
          <Check class="size-4" />
        </button>
        <button
          class="text-muted-foreground hover:text-red-400"
          title="Reject"
          @click="reject(s)"
        >
          <Trash2 class="size-3.5" />
        </button>
      </template>
    </div>

    <p
      v-if="!pending?.length"
      class="py-16 text-center text-sm text-muted-foreground"
    >
      Nothing waiting for review.
    </p>
  </div>
</template>
