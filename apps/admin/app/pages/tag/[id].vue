<script setup lang="ts">
import { Check, Trash2, Play, Send, Scissors } from 'lucide-vue-next';
import { fmt } from '~/composables/useTagPlayer';

const route = useRoute();
const supabase = useSupabaseClient();
const transport = useTemplateRef<any>('transport');
const player = computed(() => transport.value?.player);

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
// highest-volume task open to any contributor.
const startSec = ref<number | null>(null);
const endSec = ref<number | null>(null);
const name = ref('');
const shabadId = ref<number | null>(null);
const mainVerseId = ref<number | null>(null);
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

const at = () => player.value?.currentTime.value ?? 0;
function markStart() {
  startSec.value = at();
  if (endSec.value !== null && endSec.value <= startSec.value)
    endSec.value = null;
}
function markEnd() {
  endSec.value = at();
}

function onShabadSelect(v: {
  shabadId: number;
  mainVerseId: number | null;
  firstLine: string;
}) {
  shabadId.value = v.shabadId;
  mainVerseId.value = v.mainVerseId;
  // Fill the name only if the tagger hasn't written one — their wording wins,
  // since they heard it and BaniDB's transliteration may differ.
  if (!name.value.trim()) name.value = v.firstLine;
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
    main_verse_id: mainVerseId.value,
    status: publish && canPublish.value ? 'published' : 'segmented',
    source: 'manual',
    created_by: user.user?.id,
  });
  busy.value = false;
  if (error) {
    message.value = error.message;
    return;
  }

  // Roll the start forward: the next shabad begins where this one ended, so
  // consecutive segments are one click each.
  startSec.value = endSec.value;
  endSec.value = null;
  name.value = '';
  shabadId.value = null;
  mainVerseId.value = null;
  await refresh();
}

async function publishExisting(s: any) {
  message.value = '';
  const { error } = await supabase
    .from('segments')
    .update({ status: 'published' })
    .eq('id', s.id);
  if (error) message.value = error.message;
  await refresh();
}
async function remove(s: any) {
  message.value = '';
  const { error } = await supabase.from('segments').delete().eq('id', s.id);
  if (error) message.value = error.message;
  await refresh();
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

    <TagPlayer ref="transport" :src="track.url" />

    <div class="mt-4 rounded-lg border border-border p-4">
      <div class="flex flex-wrap items-center gap-2">
        <button
          class="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
          @click="markStart"
        >
          Start · <span class="tabular-nums">{{ fmt(startSec, true) }}</span>
        </button>
        <button
          class="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
          @click="markEnd"
        >
          End · <span class="tabular-nums">{{ fmt(endSec, true) }}</span>
        </button>
        <button
          v-if="endSec !== null"
          class="rounded-md border border-input px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent"
          title="Loop a few seconds either side of the cut to check it"
          @click="player?.auditionBoundary(endSec)"
        >
          <Scissors class="inline size-3.5" /> Check cut
        </button>
        <input
          v-model="name"
          placeholder="Shabad name — type what you hear"
          class="min-w-56 flex-1 rounded-md border border-input bg-card px-3 py-1.5 text-sm outline-none focus:border-ring"
          @keyup.enter="save(false)"
        />
      </div>

      <button
        class="mt-3 text-xs text-muted-foreground hover:text-foreground"
        @click="showOptions = !showOptions"
      >
        {{ showOptions ? '− Hide' : '+ Link a shabad' }}
      </button>

      <div
        v-if="showOptions"
        class="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2"
      >
        <ShabadSearch @select="onShabadSelect" />
      </div>
      <p v-if="shabadId" class="mt-2 text-xs text-emerald-400">
        Linked to shabad #{{ shabadId
        }}<span v-if="mainVerseId">, anchored on verse #{{ mainVerseId }}</span>
      </p>

      <div class="mt-4 flex flex-wrap items-center gap-2">
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
        <span class="text-xs text-muted-foreground"
          >Only published segments appear in the player.</span
        >
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
        title="Play from here"
        @click="player?.playFrom(Number(s.start_sec))"
      >
        <Play class="size-3.5" />
      </button>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm">{{ s.name }}</span>
        <span class="block truncate text-[11px] text-muted-foreground">
          {{ s.shabad_id ? `shabad #${s.shabad_id}` : '' }}
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
