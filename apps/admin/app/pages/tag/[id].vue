<script setup lang="ts">
const route = useRoute();
const supabase = useSupabaseClient();
const audio = useTemplateRef<HTMLAudioElement>('audio');

const { data: track } = await useAsyncData(`track:${route.params.id}`, async () => {
  const { data } = await supabase.from('tracks').select('*').eq('id', route.params.id).single();
  return data;
});

const { data: segments, refresh } = await useAsyncData(`segs:${route.params.id}`, async () => {
  const { data } = await supabase
    .from('segments').select('*').eq('track_id', route.params.id).order('start_sec');
  return data;
});

// Marking boundaries while listening is the highest-volume, lowest-skill task.
// Naming is the only other required field — no Gurbani literacy needed, which
// is what keeps it open to any contributor.
const startSec = ref<number | null>(null);
const endSec = ref<number | null>(null);
const name = ref('');
const saving = ref(false);
const message = ref('');

const now = () => audio.value?.currentTime ?? 0;
function markStart() { startSec.value = now(); }
function markEnd() { endSec.value = now(); }

async function save() {
  if (startSec.value === null || endSec.value === null || !name.value.trim()) return;
  saving.value = true;
  message.value = '';
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase.from('segments').insert({
    track_id: route.params.id,
    start_sec: Number(startSec.value.toFixed(2)),
    end_sec: Number(endSec.value.toFixed(2)),
    name: name.value.trim(),
    // Proposals only. Publishing runs through review, so nothing a
    // contributor saves reaches the player directly.
    status: 'segmented',
    source: 'manual',
    created_by: user.user?.id,
  });
  saving.value = false;
  if (error) { message.value = error.message; return; }
  startSec.value = endSec.value = null;
  name.value = '';
  await refresh();
}

function preview(s: any) {
  if (!audio.value) return;
  audio.value.currentTime = Number(s.start_sec);
  audio.value.play();
}

function fmt(v: number | null) {
  if (v === null) return '—';
  const m = Math.floor(v / 60), s = Math.floor(v % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
</script>

<template>
  <div v-if="track">
    <NuxtLink to="/" class="text-xs text-neutral-500 hover:text-neutral-300">← Queue</NuxtLink>
    <h1 class="mt-2 text-base">{{ track.title ?? track.raw_filename.replace(/\.[^.]+$/, '') }}</h1>
    <p class="mb-4 text-xs text-neutral-500">{{ [track.artist_dir, track.date].filter(Boolean).join(' · ') }}</p>

    <!-- Streams straight from sgpc.net; Range support is what makes seeking
         into a 70-minute set instant and free. -->
    <audio ref="audio" :src="track.url" controls preload="metadata" class="w-full" />

    <div class="mt-5 rounded border border-neutral-800 p-4">
      <div class="flex flex-wrap items-center gap-2">
        <button class="rounded border border-neutral-700 px-3 py-1.5 text-sm" @click="markStart">
          Mark start · {{ fmt(startSec) }}
        </button>
        <button class="rounded border border-neutral-700 px-3 py-1.5 text-sm" @click="markEnd">
          Mark end · {{ fmt(endSec) }}
        </button>
        <input v-model="name" placeholder="Shabad name / first line…"
          class="min-w-48 flex-1 rounded bg-neutral-900 border border-neutral-800 px-3 py-1.5 text-sm">
        <button
          class="rounded bg-neutral-100 px-4 py-1.5 text-sm text-neutral-900 disabled:opacity-40"
          :disabled="saving || startSec === null || endSec === null || !name.trim()"
          @click="save"
        >Save</button>
      </div>
      <p v-if="message" class="mt-2 text-xs text-amber-400">{{ message }}</p>
      <p class="mt-2 text-xs text-neutral-600">
        Name and boundaries are all that's required. Shabad link, raag and taal come later.
      </p>
    </div>

    <h2 class="mt-6 mb-2 text-xs uppercase tracking-wide text-neutral-500">
      Segments ({{ segments?.length ?? 0 }})
    </h2>
    <button v-for="s in segments ?? []" :key="s.id"
      class="flex w-full items-center gap-3 rounded px-3 py-2 text-left hover:bg-neutral-900"
      @click="preview(s)">
      <span class="flex-1 truncate text-sm">{{ s.name }}</span>
      <span class="text-xs tabular-nums text-neutral-500">
        {{ fmt(Number(s.start_sec)) }}–{{ fmt(Number(s.end_sec)) }}
      </span>
      <span class="text-[11px] text-neutral-600">{{ s.status }}</span>
    </button>
  </div>
</template>
