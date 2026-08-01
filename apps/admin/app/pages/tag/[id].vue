<script setup lang="ts">
import { Check, Trash2, Play, Send, Scissors } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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

const { data: renditions, refresh } = await useAsyncData(
  `rends:${route.params.id}`,
  async () => {
    const { data } = await supabase
      .from('renditions')
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

// The last name this page filled in automatically. If the field still holds
// it, the tagger has not typed anything of their own and the name can follow
// the anchor freely; if they have, their wording is left alone and offered as
// a one-click swap instead of being overwritten.
const autoFilled = ref('');
const suggestedName = ref('');

function applyAutoName(line: string, force: boolean) {
  if (force || !name.value.trim() || name.value === autoFilled.value) {
    name.value = line;
    autoFilled.value = line;
    suggestedName.value = '';
  } else {
    suggestedName.value = line;
  }
}

// Editing an existing rendition rather than creating one. A shabad is usually
// linked long after the boundaries were marked — somebody who knows the line
// comes along later — so this has to be reachable without re-marking anything.
const editingId = ref<string | null>(null);

function edit(r: any) {
  editingId.value = r.id;
  startSec.value = Number(r.start_sec);
  endSec.value = Number(r.end_sec);
  name.value = r.name;
  shabadId.value = r.shabad_id;
  mainVerseId.value = r.main_verse_id;
}

function cancelEdit() {
  editingId.value = null;
  startSec.value = null;
  endSec.value = null;
  name.value = '';
  shabadId.value = null;
  mainVerseId.value = null;
}

const canSave = computed(
  () =>
    startSec.value !== null &&
    endSec.value !== null &&
    endSec.value > startSec.value &&
    name.value.trim().length > 0
);

// Nudging one end must never push it past the other; a tenth is the finest
// step either control offers, so it is also the smallest legal gap.
const MIN_LENGTH = 0.1;
const duration = computed<number | null>(() => {
  const d = player.value?.duration.value;
  return Number.isFinite(d) && d > 0 ? d : null;
});

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
  verseId: number | null;
  firstLine: string;
}) {
  shabadId.value = v.shabadId;
  // Anchor on the line they searched for. Leaving this null would hand the
  // pick to the rahao heuristic, which is the right guess only when there is
  // nothing better — and a line the tagger just clicked is better.
  mainVerseId.value = v.verseId;
  // Fill the name only if the tagger hasn't written one — their wording wins,
  // since they heard it and BaniDB's transliteration may differ.
  applyAutoName(v.firstLine, false);
}

async function save(publish = false) {
  if (!canSave.value) return;
  busy.value = true;
  message.value = '';
  const { data: user } = await supabase.auth.getUser();

  if (editingId.value) {
    const { error: updateError } = await supabase
      .from('renditions')
      .update({
        start_sec: Number(startSec.value!.toFixed(2)),
        end_sec: Number(endSec.value!.toFixed(2)),
        name: name.value.trim(),
        shabad_id: shabadId.value,
        main_verse_id: mainVerseId.value,
        ...(publish && canPublish.value ? { status: 'published' } : {}),
      })
      .eq('id', editingId.value);
    busy.value = false;
    if (updateError) {
      message.value = updateError.message;
      return;
    }
    cancelEdit();
    await refresh();
    return;
  }

  const { error } = await supabase.from('renditions').insert({
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
    .from('renditions')
    .update({ status: 'published' })
    .eq('id', s.id);
  if (error) message.value = error.message;
  await refresh();
}
async function remove(s: any) {
  message.value = '';
  const { error } = await supabase.from('renditions').delete().eq('id', s.id);
  if (error) message.value = error.message;
  await refresh();
}
</script>

<template>
  <div v-if="track">
    <NuxtLink to="/" class="text-xs text-muted-foreground hover:text-foreground"
      >← Recordings</NuxtLink
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
        <!-- A boundary is rarely right the first time. Both ends can be walked
             in 0.1s and 1s steps rather than re-marked from the playhead, and
             each is clamped so the pair cannot cross. -->
        <BoundaryControl
          v-model="startSec"
          label="Start"
          :min="0"
          :max="endSec !== null ? endSec - MIN_LENGTH : duration"
          @mark="markStart"
        />
        <BoundaryControl
          v-model="endSec"
          label="End"
          :min="startSec !== null ? startSec + MIN_LENGTH : 0"
          :max="duration"
          @mark="markEnd"
        />
        <Button
          v-if="endSec !== null"
          variant="outline"
          size="sm"
          class="text-xs text-muted-foreground"
          title="Loop a few seconds either side of the cut to check it"
          @click="player?.auditionBoundary(endSec)"
        >
          <Scissors class="size-3.5" /> Check cut
        </Button>
      </div>

      <!-- Identifying the shabad is the main act, not an option behind a
           toggle: it is what produces the name, the ang, the author and the
           read-along, and it is the same order the notation editor uses —
           find the shabad first, everything else follows from it. -->
      <div class="mt-4 border-t border-border pt-4">
        <ShabadSearch v-if="!shabadId" @select="onShabadSelect" />
        <ShabadDisplay
          v-else
          :key="shabadId"
          v-model:main-verse-id="mainVerseId"
          :shabad-id="shabadId"
          @clear="
            () => {
              shabadId = null;
              mainVerseId = null;
            }
          "
          @first-line="(line: string) => applyAutoName(line, false)"
          @renamed="(line: string) => applyAutoName(line, false)"
        />
      </div>

      <!-- Derived from the anchor line once a shabad is linked, but still
           free text: someone who recognises a shabad by ear without being able
           to find it in BaniDB can type a name and stop there, which is what
           keeps the highest-volume task open to any contributor. -->
      <div class="mt-4">
        <Label for="shabad-name" class="mb-1 text-[11px] text-muted-foreground">
          Name
          <span v-if="shabadId" class="text-muted-foreground/70">
            — from the main verse, edit if you'd write it differently
          </span>
        </Label>
        <Input
          id="shabad-name"
          v-model="name"
          placeholder="Type what you hear, or pick a shabad above"
          class="bg-card"
          @keyup.enter="save(false)"
        />
        <p v-if="suggestedName" class="mt-1.5 text-xs text-muted-foreground">
          Anchor line reads
          <span class="text-foreground">{{ suggestedName }}</span> —
          <Button
            variant="link"
            class="h-auto p-0 text-xs text-amber-400"
            @click="applyAutoName(suggestedName, true)"
          >
            use as name
          </Button>
        </p>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" :disabled="busy || !canSave" @click="save(false)">
          Save shabad
        </Button>
        <Button
          v-if="canPublish"
          variant="outline"
          size="sm"
          :disabled="busy || !canSave"
          @click="save(true)"
        >
          <Send class="size-3.5" /> Save &amp; publish
        </Button>
        <span class="text-xs text-muted-foreground"
          >Only published shabads appear in the player.</span
        >
      </div>
      <p v-if="message" class="mt-2 text-xs text-amber-400">{{ message }}</p>
    </div>

    <h2 class="mt-6 mb-2 text-xs tracking-wide text-muted-foreground uppercase">
      Shabads ({{ renditions?.length ?? 0 }})
    </h2>
    <div
      v-for="s in renditions ?? []"
      :key="s.id"
      class="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent"
      :class="s.id === editingId && 'bg-accent ring-1 ring-primary/40'"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        class="size-7 text-muted-foreground"
        title="Play from here"
        @click="player?.playFrom(Number(s.start_sec))"
      >
        <Play class="size-3.5" />
      </Button>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm">{{ s.name }}</span>
        <span class="block truncate text-[11px] text-muted-foreground">
          {{
            s.shabad_id
              ? `shabad #${s.shabad_id}${s.main_verse_id ? ` · verse #${s.main_verse_id}` : ''}`
              : 'no shabad linked'
          }}
        </span>
      </span>
      <span class="text-xs tabular-nums text-muted-foreground">
        {{ fmt(Number(s.start_sec)) }}–{{ fmt(Number(s.end_sec)) }}
      </span>
      <Badge
        :variant="s.status === 'published' ? 'default' : 'secondary'"
        class="rounded-full text-[11px]"
        :class="
          s.status === 'published' && 'bg-emerald-500/15 text-emerald-400'
        "
        >{{ s.status }}</Badge
      >
      <template v-if="canPublish">
        <Button
          v-if="s.status !== 'published'"
          variant="ghost"
          size="icon-sm"
          class="size-7 text-emerald-400"
          title="Publish"
          @click="publishExisting(s)"
        >
          <Check class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          class="size-7 text-muted-foreground hover:text-destructive"
          title="Delete"
          @click="remove(s)"
        >
          <Trash2 class="size-3.5" />
        </Button>
      </template>
    </div>
  </div>
</template>
