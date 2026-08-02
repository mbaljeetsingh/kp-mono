<script setup lang="ts">
import { Trash2, Play, Send, Scissors, Pencil } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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

const { data: userId } = await useAsyncData('me', async () => {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
});

/**
 * Who may revise which row, mirroring the UPDATE policy on `renditions`:
 * review permission edits anything, everyone else only their own unpublished
 * work. Worth deciding here rather than offering the button to everyone,
 * because an update that RLS filters out comes back 204 with no error — the
 * form would clear itself and the row would sit there unchanged.
 */
function canEdit(r: any) {
  if (canPublish.value) return true;
  return r.created_by === userId.value && r.status !== 'published';
}

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
/** The row being revised, so the form can name it and adapt its buttons to
 *  whether it is already published. */
const editing = ref<any>(null);
const formEl = useTemplateRef<HTMLElement>('formEl');

function edit(r: any) {
  editingId.value = r.id;
  editing.value = r;
  startSec.value = Number(r.start_sec);
  endSec.value = Number(r.end_sec);
  name.value = r.name;
  shabadId.value = r.shabad_id;
  mainVerseId.value = r.main_verse_id;
  message.value = '';
  // The form is above the list, and the list can run long — without this, a
  // click on the tenth row looks like it did nothing.
  formEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEdit() {
  editingId.value = null;
  editing.value = null;
  startSec.value = null;
  endSec.value = null;
  name.value = '';
  shabadId.value = null;
  mainVerseId.value = null;
  autoFilled.value = '';
  suggestedName.value = '';
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
    // `select('id')` is what makes a refused edit visible. RLS filters rows out
    // of an UPDATE rather than rejecting it, so without asking for the changed
    // rows back this returns 204 with no error and the revision silently
    // evaporates — the form clears and the row keeps its old values.
    const { data: changed, error: updateError } = await supabase
      .from('renditions')
      .update({
        start_sec: Number(startSec.value!.toFixed(2)),
        end_sec: Number(endSec.value!.toFixed(2)),
        name: name.value.trim(),
        shabad_id: shabadId.value,
        main_verse_id: mainVerseId.value,
        ...(publish && canPublish.value ? { status: 'published' } : {}),
      })
      .eq('id', editingId.value)
      .select('id');
    busy.value = false;
    if (updateError) {
      message.value = updateError.message;
      return;
    }
    if (!changed?.length) {
      message.value =
        'Nothing changed — a published shabad can only be revised with review permission.';
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

/**
 * Publishing is reversible.
 *
 * Only `published` is visible in the player, so pulling a shabad back is a
 * status change and nothing else — the tags, boundaries and shabad link all
 * survive, which is what makes it safe to publish early and fix later. It
 * returns to `reviewed` rather than `draft`: the work was complete enough to
 * publish once, and sending it back to draft would misreport that.
 */
async function setPublished(s: any, published: boolean) {
  // Selecting the state a row is already in is a no-op, not a write: the menu
  // offers two states, but five of the six enum values mean "not published",
  // and a draft chosen as "Unpublished" must stay a draft rather than being
  // promoted to `reviewed`.
  if ((s.status === 'published') === published) return;

  message.value = '';
  const next = published ? 'published' : 'reviewed';
  // Asks for the affected rows back for the same reason as the edit above: a
  // row RLS declines to touch is absent from the result, not an error.
  const { data, error } = await supabase
    .from('renditions')
    .update({ status: next })
    .eq('id', s.id)
    .select('id');
  if (error) message.value = error.message;
  else if (!data?.length)
    message.value = `Not permitted to ${next === 'published' ? 'publish' : 'unpublish'} that one.`;
  await refresh();
}
/**
 * Deleting is the one irreversible action on this page — the boundaries, the
 * name and the shabad link go with the row, and re-marking them is minutes of
 * work — so it asks first. One dialog for the page rather than one per row,
 * holding the row it was opened for.
 */
const pendingDelete = ref<any>(null);

async function confirmRemove() {
  const s = pendingDelete.value;
  pendingDelete.value = null;
  if (s) await remove(s);
}

async function remove(s: any) {
  message.value = '';
  const { data, error } = await supabase
    .from('renditions')
    .delete()
    .eq('id', s.id)
    .select('id');
  if (error) message.value = error.message;
  else if (!data?.length) message.value = 'Not permitted to delete that one.';
  // Deleting the row being revised would leave the form editing a ghost.
  if (s.id === editingId.value) cancelEdit();
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

    <div
      ref="formEl"
      class="mt-4 rounded-lg border p-4"
      :class="editingId ? 'border-primary/40 bg-accent/30' : 'border-border'"
    >
      <!-- The form does double duty, so it has to say which job it is doing:
           the same fields silently switching from "new shabad" to "revising
           that one" is how somebody overwrites a row they meant to add. -->
      <div
        v-if="editing"
        class="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
      >
        <Pencil class="size-3.5 text-primary" />
        <span>
          Editing
          <span class="text-foreground">{{ editing.name }}</span>
          <span v-if="editing.status === 'published'"> · published</span>
        </span>
        <Button variant="link" class="h-auto p-0 text-xs" @click="cancelEdit">
          cancel and start a new shabad
        </Button>
      </div>

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
          {{ editingId ? 'Update shabad' : 'Save shabad' }}
        </Button>
        <!-- Nothing to offer a published row here: it is already published, and
             the update carries its status through untouched. -->
        <Button
          v-if="canPublish && editing?.status !== 'published'"
          variant="outline"
          size="sm"
          :disabled="busy || !canSave"
          @click="save(true)"
        >
          <Send class="size-3.5" />
          {{ editingId ? 'Update &amp; publish' : 'Save &amp; publish' }}
        </Button>
        <Button
          v-if="editingId"
          variant="ghost"
          size="sm"
          class="text-muted-foreground"
          @click="cancelEdit"
        >
          Cancel
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
      <!-- A stock Select, because this is a field with two values rather than a
           menu of actions: it shows the current one and changes it in the same
           control. Non-reviewers get the read-only badge below — no control that
           leads to a write RLS will refuse. -->
      <Select
        v-if="canPublish"
        :model-value="s.status === 'published' ? 'published' : 'unpublished'"
        @update:model-value="(v: any) => setPublished(s, v === 'published')"
      >
        <SelectTrigger
          size="sm"
          class="h-7 text-[11px]"
          :class="s.status === 'published' && 'text-emerald-400'"
          title="Whether this shabad appears in the player"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="published" class="text-xs">Published</SelectItem>
          <SelectItem value="unpublished" class="text-xs">
            Unpublished
          </SelectItem>
        </SelectContent>
      </Select>
      <Badge
        v-else
        :variant="s.status === 'published' ? 'default' : 'secondary'"
        class="rounded-full text-[11px]"
        :class="
          s.status === 'published' && 'bg-emerald-500/15 text-emerald-400'
        "
        >{{ s.status }}</Badge
      >
      <!-- Shown only where the UPDATE policy will actually accept it, so the
           button never leads to a refused edit. A shabad is usually linked long
           after its boundaries were marked — somebody who knows the line comes
           along later — so this is the normal way in, not a repair hatch. -->
      <Button
        v-if="canEdit(s)"
        variant="ghost"
        size="icon-sm"
        class="size-7 text-muted-foreground"
        :title="
          s.id === editingId
            ? 'Editing this one'
            : 'Edit name, shabad or timing'
        "
        :class="s.id === editingId && 'text-primary'"
        @click="edit(s)"
      >
        <Pencil class="size-3.5" />
      </Button>

      <template v-if="canPublish">
        <Button
          variant="ghost"
          size="icon-sm"
          class="size-7 text-muted-foreground hover:text-destructive"
          title="Delete"
          @click="pendingDelete = s"
        >
          <Trash2 class="size-3.5" />
        </Button>
      </template>
    </div>

    <AlertDialog
      :open="!!pendingDelete"
      @update:open="(o: boolean) => !o && (pendingDelete = null)"
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete “{{ pendingDelete?.name }}”?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The boundaries, name and shabad link go with it, and the recording
            itself is untouched. If you only want it out of the player, set it
            to Unpublished instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-white hover:bg-destructive/90"
            @click="confirmRemove"
          >
            Delete shabad
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
