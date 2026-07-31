<script setup lang="ts">
import { Check, Trash2, Play, Send } from 'lucide-vue-next';

const route = useRoute();
const supabase = useSupabaseClient();
const audio = useTemplateRef<HTMLAudioElement>('audio');

const { data: track } = await useAsyncData(
  `track:${route.params.id}`,
  async () => {
    const { data } = await supabase
      .from('tracks')
      .select('*')
      .eq('id', route.params.id)
      .single();
    return data;
  }
);

const { data: segments, refresh } = await useAsyncData(
  `segs:${route.params.id}`,
  async () => {
    const { data } = await supabase
      .from('segments')
      .select('*')
      .eq('track_id', route.params.id)
      .order('start_sec');
    return data;
  }
);

const { data: canPublish } = await useAsyncData('can-publish', async () => {
  const { data } = await supabase.rpc('is_reviewer');
  return data === true;
});

// A segment IS the shabad the player shows. Name is the only required field —
// typing what you hear needs no Gurbani literacy, which is what keeps the
// highest-volume task open to any contributor. Everything below it is additive.
const startSec = ref<number | null>(null);
const endSec = ref<number | null>(null);
const name = ref('');
const shabadId = ref<number | null>(null);
const raag = ref('');
const taal = ref('');
const instrument = ref('');
const busy = ref(false);
const message = ref('');
const showOptions = ref(false);

const canSave = computed(
  () =>
    startSec.value !== null &&
    endSec.value !== null &&
    endSec.value > startSec.value &&
    name.value.trim().length > 0
);

function markStart() {
  startSec.value = audio.value?.currentTime ?? 0;
  // The next shabad starts where this one ends, so chaining is the common case.
  if (endSec.value !== null && endSec.value <= startSec.value)
    endSec.value = null;
}
function markEnd() {
  endSec.value = audio.value?.currentTime ?? 0;
}

function onShabadSelect(v: {
  shabadId: number;
  firstLine: string;
  raag?: string;
}) {
  shabadId.value = v.shabadId;
  // Linking fills the name only if the tagger hasn't written one — their own
  // wording wins, since they heard it and BaniDB's transliteration may differ.
  if (!name.value.trim()) name.value = v.firstLine;
  if (v.raag && !raag.value) raag.value = v.raag;
}

async function save(publish = false) {
  if (!canSave.value) return;
  busy.value = true;
  message.value = '';
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase.from('segments').insert({
    track_id: route.params.id,
    start_sec: Number(startSec.value!.toFixed(2)),
    end_sec: Number(endSec.value!.toFixed(2)),
    name: name.value.trim(),
    shabad_id: shabadId.value,
    raag: raag.value.trim() || null,
    taal: taal.value.trim() || null,
    instrument: instrument.value.trim() || null,
    status: publish && canPublish.value ? 'published' : 'segmented',
    source: 'manual',
    created_by: user.user?.id,
  });
  busy.value = false;
  if (error) {
    message.value = error.message;
    return;
  }

  // Roll the start forward so the next shabad can be marked with one click.
  startSec.value = endSec.value;
  endSec.value = null;
  name.value = '';
  shabadId.value = null;
  raag.value = '';
  taal.value = '';
  instrument.value = '';
  await refresh();
}

async function publishExisting(s: any) {
  await supabase
    .from('segments')
    .update({ status: 'published' })
    .eq('id', s.id);
  await refresh();
}
async function remove(s: any) {
  await supabase.from('segments').delete().eq('id', s.id);
  await refresh();
}
function preview(s: any) {
  if (!audio.value) return;
  audio.value.currentTime = Number(s.start_sec);
  audio.value.play();
}

function fmt(v: number | null) {
  if (v === null || !Number.isFinite(v)) return '—';
  const m = Math.floor(v / 60),
    s = Math.floor(v % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
</script>

<template>
  <div v-if="track">
    <NuxtLink to="/" class="text-xs text-muted-foreground hover:text-foreground"
      >← Queue</NuxtLink
    >
    <h1 class="mt-2 text-base font-medium">
      {{ track.title ?? track.raw_filename }}
    </h1>
    <p class="mb-4 text-xs text-muted-foreground">
      {{ [track.artist_dir, track.date].filter(Boolean).join(' · ') }}
    </p>

    <!-- Range requests make seeking into a 70-minute set instant, so scrubbing
         to find a boundary costs nothing. -->
    <audio
      ref="audio"
      :src="track.url"
      controls
      preload="metadata"
      class="w-full"
    />

    <div class="mt-5 rounded-lg border border-border p-4">
      <div class="flex flex-wrap items-center gap-2">
        <button
          class="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
          @click="markStart"
        >
          Start · <span class="tabular-nums">{{ fmt(startSec) }}</span>
        </button>
        <button
          class="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
          @click="markEnd"
        >
          End · <span class="tabular-nums">{{ fmt(endSec) }}</span>
        </button>
        <input
          v-model="name"
          placeholder="Shabad name — type what you hear"
          class="min-w-56 flex-1 rounded-md border border-input bg-card px-3 py-1.5 text-sm outline-none focus:border-ring"
        />
      </div>

      <button
        class="mt-3 text-xs text-muted-foreground hover:text-foreground"
        @click="showOptions = !showOptions"
      >
        {{
          showOptions
            ? '− Fewer options'
            : '+ Link shabad, raag, taal, instrument'
        }}
      </button>

      <div
        v-if="showOptions"
        class="mt-3 space-y-3 border-t border-border pt-3"
      >
        <ShabadSearch @select="onShabadSelect" />
        <p v-if="shabadId" class="text-xs text-emerald-400">
          Linked to BaniDB shabad #{{ shabadId }} — lyrics, ang and author come
          from there.
        </p>
        <div class="grid gap-2 sm:grid-cols-3">
          <input
            v-model="raag"
            placeholder="Raag"
            class="rounded-md border border-input bg-card px-3 py-1.5 text-sm outline-none focus:border-ring"
          />
          <input
            v-model="taal"
            placeholder="Taal"
            class="rounded-md border border-input bg-card px-3 py-1.5 text-sm outline-none focus:border-ring"
          />
          <input
            v-model="instrument"
            placeholder="Instrument (taus, dilruba…)"
            class="rounded-md border border-input bg-card px-3 py-1.5 text-sm outline-none focus:border-ring"
          />
        </div>
      </div>

      <div class="mt-4 flex items-center gap-2">
        <button
          class="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
          :disabled="busy || !canSave"
          @click="save(false)"
        >
          Save segment
        </button>
        <button
          v-if="canPublish"
          class="flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm disabled:opacity-40"
          :disabled="busy || !canSave"
          @click="save(true)"
        >
          <Send class="size-3.5" /> Save &amp; publish
        </button>
        <span class="text-xs text-muted-foreground">
          Only published segments appear in the player.
        </span>
      </div>
      <p v-if="message" class="mt-2 text-xs text-amber-400">{{ message }}</p>
    </div>

    <h2 class="mt-6 mb-2 text-xs tracking-wide text-muted-foreground uppercase">
      Segments ({{ segments?.length ?? 0 }})
    </h2>
    <div
      v-for="s in segments ?? []"
      :key="s.id"
      class="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent"
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
            [
              s.raag,
              s.taal,
              s.instrument,
              s.shabad_id ? `#${s.shabad_id}` : null,
            ]
              .filter(Boolean)
              .join(' · ')
          }}
        </span>
      </span>
      <span class="text-xs tabular-nums text-muted-foreground">
        {{ fmt(Number(s.start_sec)) }}–{{ fmt(Number(s.end_sec)) }}
      </span>
      <span
        class="rounded-full px-2 py-0.5 text-[11px]"
        :class="
          s.status === 'published'
            ? 'bg-emerald-500/15 text-emerald-400'
            : 'bg-accent text-muted-foreground'
        "
        >{{ s.status }}</span
      >
      <template v-if="canPublish">
        <button
          v-if="s.status !== 'published'"
          class="text-emerald-400 hover:text-emerald-300"
          title="Publish"
          @click="publishExisting(s)"
        >
          <Check class="size-4" />
        </button>
        <button
          class="text-muted-foreground hover:text-red-400"
          title="Delete"
          @click="remove(s)"
        >
          <Trash2 class="size-3.5" />
        </button>
      </template>
    </div>
  </div>
</template>
