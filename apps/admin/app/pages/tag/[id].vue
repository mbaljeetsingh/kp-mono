<script setup lang="ts">
import {
  Trash2,
  Play,
  Send,
  Scissors,
  Pencil,
  Sparkles,
  ListMusic,
  ArrowLeft,
  Check,
} from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MIN_LENGTH, fmt } from '~/composables/useTagPlayer';
import { coverageOpen } from '@/lib/tagging';

const route = useRoute();
const supabase = useSupabaseClient();
const transport = useTemplateRef<any>('transport');
const player = computed(() => transport.value?.player);

// The `recordings` view rather than `tracks`: it carries the artist photo, so a
// recording is recognisable by the same face here as in the list you came from,
// and the slot length gives the header something to say before the audio's own
// metadata arrives.
const { data: track, refresh: refreshTrack } = await useAsyncData(
  `track:${route.params.id}`,
  async () => {
    const { data } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', route.params.id)
      .maybeSingle();
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

// What the scan saw but refused to draft — listen-here pointers, not tags.
// Times are track-clock seconds, so the transport can jump straight there.
const { data: scanFindings } = await useAsyncData(
  `scan-findings:${route.params.id}`,
  async () => {
    const { data } = await supabase
      .from('scan_requests')
      .select('findings')
      .eq('track_id', route.params.id)
      .maybeSingle();
    const found = (data?.findings ?? []) as {
      shabad_id: number;
      name: string;
      start: number;
      end: number;
      confidence: number;
    }[];
    return [...found].sort((a, b) => a.start - b.start);
  }
);

// Three permissions, asked separately, because they do not travel together —
// see useMyPermissions for why that matters to the `trusted` role.
const { canReview, canPublish, canDelete, canMarkDone } =
  await useMyPermissions();

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
  if (canReview.value) return true;
  return r.created_by === userId.value && r.status !== 'published';
}

/** Mirrors the UPDATE policy for a status change — see canPublishRendition. */
function canPublishRow(r: any) {
  return canPublishRendition(
    r,
    { canReview: canReview.value, canPublish: canPublish.value },
    userId.value
  );
}

/**
 * The list row's second line: shabad link state, plus whatever the status
 * control cannot say. `source` matters because a scan suggestion earns a
 * closer look at its boundaries than a human draft — 'manual' is the norm and
 * saying it on every row would be noise. The exact status shows for reviewers
 * because their two-state Select collapses everything unpublished to
 * "Unpublished", hiding the difference between a bare cut and a linked one;
 * everyone else already sees it on the badge.
 */
function rowMeta(s: any) {
  return [
    s.shabad_id
      ? `shabad #${s.shabad_id}${s.main_verse_id ? ` · verse #${s.main_verse_id}` : ''}`
      : 'no shabad linked',
    s.source !== 'manual' ? s.source : null,
    canReview.value && s.status !== 'published' ? s.status : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// A segment IS the shabad the player shows. Name is the only required field —
// typing what you hear needs no Gurbani literacy, which is what keeps the
// highest-volume task open to any contributor.
const startSec = ref<number | null>(null);
const endSec = ref<number | null>(null);
const name = ref('');
const shabadId = ref<number | null>(null);
const mainVerseId = ref<number | null>(null);
// Optional musical tags. The player searches and displays raag; taal is
// recorded for the day something reads it. Neither gates saving.
const raag = ref('');
const taal = ref('');
const busy = ref(false);
const message = ref('');

/**
 * Refusals from the list, kept against the row that earned them.
 *
 * These used to land in the form's single `message` line, which sits above the
 * list — so a publish RLS declined on the tenth row reported itself off the top
 * of the screen, next to fields that had nothing to do with it. Keyed by id,
 * the sentence appears under the row you clicked.
 */
const rowError = ref<Record<string, string>>({});

// The last name this page filled in automatically. If the field still holds
// it, the tagger has not typed anything of their own and the name can follow
// the anchor freely; if they have, their wording is left alone and offered as
// a one-click swap instead of being overwritten.
const autoFilled = ref('');
const suggestedName = ref('');

function applyAutoName(line: string, force: boolean) {
  // Already what the field says — offering to "use as name" here proposes no
  // change at all, which is what every edit of an already-linked row used to
  // show the moment its shabad finished loading.
  if (name.value.trim() === line) {
    autoFilled.value = line;
    suggestedName.value = '';
    return;
  }
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

/**
 * Bring the form into view after the fields have been filled.
 *
 * Awaiting the tick matters: filling boundaries grows the form by a row — the
 * length readout and "Check cut" appear — and a smooth scroll started before
 * that reflow gets cancelled by it, which looked exactly like the click having
 * done nothing at all.
 */
async function focusForm() {
  await nextTick();
  formEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function edit(r: any) {
  editingId.value = r.id;
  editing.value = r;
  startSec.value = Number(r.start_sec);
  endSec.value = Number(r.end_sec);
  name.value = r.name;
  shabadId.value = r.shabad_id;
  mainVerseId.value = r.main_verse_id;
  raag.value = r.raag ?? '';
  taal.value = r.taal ?? '';
  message.value = '';
  // The form is above the list, and the list can run long — without this, a
  // click on the tenth row looks like it did nothing.
  void focusForm();
}

// Arriving from the review queue lands straight in editing mode: pending.vue
// links here as /tag/<track>?rendition=<id> so a reviewer starts on the row
// they clicked — a scan suggestion whose boundaries need checking — rather
// than hunting for it in the list below. Only rows the UPDATE policy would
// accept load, for the same reason the edit button hides on the others.
onMounted(() => {
  const wanted = route.query.rendition;
  if (typeof wanted !== 'string') return;
  const r = (renditions.value ?? []).find((x: any) => x.id === wanted);
  if (r && canEdit(r)) edit(r);
});

function cancelEdit() {
  editingId.value = null;
  editing.value = null;
  startSec.value = null;
  endSec.value = null;
  name.value = '';
  shabadId.value = null;
  mainVerseId.value = null;
  raag.value = '';
  taal.value = '';
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
const duration = computed<number | null>(() => {
  const d = player.value?.duration.value;
  return Number.isFinite(d) && d > 0 ? d : null;
});

const at = () => player.value?.currentTime.value ?? 0;
function markStart() {
  const now = at();
  startSec.value = now;
  if (endSec.value !== null && endSec.value <= now) endSec.value = null;
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

/* ---------------------------------------------------------------------------
 * What is done and what is left.
 *
 * The one question behind every decision on this page. Spans are merged before
 * anything is measured, so two taggers who marked overlapping cuts cannot push
 * coverage past 100% or hide a gap between them.
 * ------------------------------------------------------------------------- */

function mergeSpans(spans: { start: number; end: number }[]) {
  const out: { start: number; end: number }[] = [];
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    const last = out.at(-1);
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ start: s.start, end: s.end });
  }
  return out;
}

const tagged = computed(() =>
  mergeSpans(
    (renditions.value ?? []).map((s: any) => ({
      start: Number(s.start_sec),
      end: Number(s.end_sec),
    }))
  )
);

const taggedSeconds = computed(() =>
  tagged.value.reduce((sum, s) => sum + (s.end - s.start), 0)
);

const publishedCount = computed(
  () =>
    (renditions.value ?? []).filter((s: any) => s.status === 'published').length
);

/** Untagged stretches long enough to hold a shabad. Anything shorter is the
 *  breath between two cuts, not work left to do, and listing it would bury the
 *  real gaps in noise. */
const MIN_GAP = 45;

const gaps = computed(() => {
  const out: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const s of tagged.value) {
    if (s.start - cursor >= MIN_GAP) out.push({ start: cursor, end: s.start });
    cursor = Math.max(cursor, s.end);
  }
  // The tail only exists once the audio has told us how long it is.
  const d = duration.value;
  if (d && d - cursor >= MIN_GAP) out.push({ start: cursor, end: d });
  return out;
});

const untaggedSeconds = computed(() =>
  gaps.value.reduce((sum, g) => sum + (g.end - g.start), 0)
);

/**
 * The tagger's word that the untagged remainder is not shabads.
 *
 * Coverage can only measure; it cannot hear that the last fifteen minutes are
 * announcements, simran or ardas. Without this assertion such a recording
 * sits on In progress forever — unfinishable by any amount of tagging — so
 * the mark is what lets the recordings list count it done. Reversible, like
 * publishing: unmarking clears the columns and the shelves recompute.
 */
const taggingDone = computed(() => !!track.value?.tagged_done_at);

/**
 * Whether the shelves would still hold this recording open on coverage.
 *
 * Deliberately the VIEW's number, not this page's gap list: the two disagree
 * whenever the filename slot and the real audio do (routinely, by minutes),
 * and the mark-done offer must appear exactly where the shelf traps the
 * recording — a fully-tagged set whose slot overestimates its length showed
 * "0:00 left" here while sitting on In progress forever, with no way out.
 * NULL means the length is unknowable (no slot), which also needs the mark.
 */
const shelfCoverageOpen = computed(() =>
  coverageOpen(track.value?.untagged_seconds)
);

const doneBusy = ref(false);
const doneError = ref('');

async function setTaggingDone(done: boolean) {
  doneBusy.value = true;
  doneError.value = '';
  const { data: user } = await supabase.auth.getUser();
  // `select('id')` for the same reason every other write here asks for its
  // rows back: RLS filters refused rows out of an UPDATE silently.
  const { data, error } = await supabase
    .from('tracks')
    .update(
      done
        ? {
            tagged_done_at: new Date().toISOString(),
            tagged_done_by: user.user?.id,
          }
        : { tagged_done_at: null, tagged_done_by: null }
    )
    .eq('id', route.params.id)
    .select('id');
  doneBusy.value = false;
  if (error) {
    doneError.value = error.message;
    return;
  }
  if (!data?.length) {
    doneError.value = 'Not permitted to change that.';
    return;
  }
  await refreshTrack();
}

/** Segments and gaps on one axis, in time order, so the list reads as the
 *  recording does rather than as a table of rows with holes you have to infer. */
const listRows = computed(() => {
  const segs = (renditions.value ?? []).map((s: any, i: number) => ({
    kind: 'segment' as const,
    key: s.id as string,
    start: Number(s.start_sec),
    n: i + 1,
    s,
  }));
  const holes = gaps.value.map((g) => ({
    kind: 'gap' as const,
    key: `gap-${g.start}-${g.end}`,
    start: g.start,
    n: 0,
    g,
  }));
  return [...segs, ...holes].sort((a, b) => a.start - b.start);
});

const segments = computed(() =>
  (renditions.value ?? []).map((s: any) => ({
    id: s.id as string,
    start: Number(s.start_sec),
    end: Number(s.end_sec),
    name: s.name as string,
    published: s.status === 'published',
  }))
);

const pointers = computed(() =>
  (scanFindings.value ?? []).map((f) => ({
    start: f.start,
    end: f.end,
    name: f.name,
  }))
);

/** A pointer whose middle already sits inside tagged time is almost certainly
 *  the shabad somebody has already marked. Still listed — the boundaries may
 *  disagree — but visibly not work waiting to be done. */
function pointerCovered(f: { start: number; end: number }) {
  const mid = (f.start + f.end) / 2;
  return tagged.value.some((s) => mid >= s.start && mid <= s.end);
}

/** One click from pointer to workbench: boundaries and a starting name land in
 *  the form, the transport jumps there — and NOTHING is saved. The pointer
 *  stays a suggestion; the tagger who listens does the asserting, which is the
 *  whole covenant of this pipeline. */
function tagFromPointer(f: { name: string; start: number; end: number }) {
  cancelEdit();
  startSec.value = f.start;
  endSec.value = f.end;
  // Boundaries and a starting name — deliberately NOT the shabad link. The
  // pointer's guess is below-gate by definition; the tagger who listens picks
  // the shabad in search, and the name refreshes when they set the anchor.
  if (!name.value.trim()) name.value = f.name;
  player.value?.seek(Math.max(0, f.start - 5));
  void focusForm();
}

/** Same idea for an untagged stretch: the neighbouring cuts are the best guess
 *  at where this shabad runs, so they become the starting boundaries and the
 *  tagger nudges from there instead of marking both ends from scratch. */
function tagGap(g: { start: number; end: number }) {
  cancelEdit();
  startSec.value = Math.round(g.start * 100) / 100;
  endSec.value = Math.round(g.end * 100) / 100;
  player.value?.seek(g.start);
  void focusForm();
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
        raag: raag.value.trim() || null,
        taal: taal.value.trim() || null,
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
    raag: raag.value.trim() || null,
    taal: taal.value.trim() || null,
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
  raag.value = '';
  taal.value = '';
  // Both belong to the name that was just saved. Left behind, the anchor-line
  // hint keeps offering a swap for a shabad this form no longer has.
  autoFilled.value = '';
  suggestedName.value = '';
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

  delete rowError.value[s.id];
  const next = published ? 'published' : 'reviewed';
  // Asks for the affected rows back for the same reason as the edit above: a
  // row RLS declines to touch is absent from the result, not an error.
  const { data, error } = await supabase
    .from('renditions')
    .update({ status: next })
    .eq('id', s.id)
    .select('id');
  if (error) rowError.value[s.id] = error.message;
  else if (!data?.length)
    rowError.value[s.id] =
      `Not permitted to ${next === 'published' ? 'publish' : 'unpublish'} that one.`;
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
  delete rowError.value[s.id];
  const { data, error } = await supabase
    .from('renditions')
    .delete()
    .eq('id', s.id)
    .select('id');
  if (error) rowError.value[s.id] = error.message;
  else if (!data?.length)
    rowError.value[s.id] = 'Not permitted to delete that one.';
  // Deleting the row being revised would leave the form editing a ghost.
  if (s.id === editingId.value) cancelEdit();
  await refresh();
}

/** The filename is the identifier when a recording has no title, but the
 *  extension is never part of what anyone calls it. */
const heading = computed(() => {
  const t = track.value;
  if (!t) return '';
  return (t.title ?? t.raw_filename ?? '').replace(/\.(mp3|m4a|ogg|wav)$/i, '');
});

const subtitle = computed(() =>
  [track.value?.artist_dir, track.value?.date].filter(Boolean).join(' · ')
);

/** Real duration once the audio says so, the published slot length until then —
 *  labelled as an estimate, because they routinely disagree by minutes. */
const lengthLabel = computed(() => {
  if (duration.value) return fmt(duration.value);
  const est = track.value?.est_seconds;
  return est ? `≈${Math.round(est / 60)} min` : '—';
});
</script>

<template>
  <div v-if="!track" class="py-24 text-center">
    <p class="text-sm text-muted-foreground">
      That recording isn’t in the catalogue.
    </p>
    <Button variant="outline" size="sm" class="mt-4" as-child>
      <NuxtLink to="/"
        ><ArrowLeft class="size-3.5" /> Back to recordings</NuxtLink
      >
    </Button>
  </div>

  <div v-else>
    <NuxtLink
      to="/"
      class="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
    >
      <ArrowLeft class="size-3" /> Recordings
    </NuxtLink>

    <header class="mt-2 flex flex-wrap items-start gap-x-4 gap-y-3">
      <!-- The minimum width is what makes the scoreboard wrap below on a narrow
           screen instead of squeezing the title down to "Bhai …". -->
      <div class="flex min-w-64 flex-1 items-start gap-3">
        <ArtTile
          :name="track.artist_dir ?? track.raw_filename"
          :photo="track.artist_photo"
          class="size-11"
        />
        <div class="min-w-0">
          <h1 class="truncate text-xl font-semibold" :title="heading">
            {{ heading }}
          </h1>
          <p class="mt-0.5 truncate text-sm text-muted-foreground">
            {{ subtitle }}
            <span class="text-muted-foreground/60">· {{ lengthLabel }}</span>
          </p>
        </div>
      </div>

      <!-- The scoreboard for this recording. It answers "is this one finished?"
           without counting rows, and the minutes left are the number that
           decides whether to keep going or pick a shorter set. -->
      <dl class="flex shrink-0 items-start gap-5 text-right">
        <div>
          <dt class="text-[11px] text-muted-foreground">Shabads</dt>
          <dd class="text-sm tabular-nums">
            <span
              :class="
                publishedCount === (renditions?.length ?? 0) &&
                publishedCount > 0
                  ? 'text-emerald-400'
                  : ''
              "
              >{{ publishedCount }}</span
            ><span class="text-muted-foreground/60"
              >/{{ renditions?.length ?? 0 }} published</span
            >
          </dd>
        </div>
        <div v-if="duration">
          <dt class="text-[11px] text-muted-foreground">Tagged</dt>
          <dd class="text-sm tabular-nums">
            {{ Math.round((taggedSeconds / duration) * 100) }}%
            <!-- Marked done, the minutes left stop being a todo — repeating
                 them here would keep calling the recording unfinished. -->
            <span v-if="taggingDone" class="text-emerald-400">· done</span>
            <span v-else class="text-muted-foreground/60"
              >· {{ fmt(untaggedSeconds) }} left</span
            >
          </dd>
        </div>
      </dl>
    </header>

    <!-- The transport follows you down the page.
         It is the instrument this whole page is built around, and every job
         below it — checking a saved cut, listening to a scan pointer, hearing
         whether a gap holds a shabad — needs playback and the axis. Letting
         them scroll away meant scrolling back up to press play. -->
    <div
      class="sticky top-0 z-20 -mx-6 mt-4 border-b border-border bg-background/95 px-6 py-3 backdrop-blur"
    >
      <TagPlayer
        ref="transport"
        v-model:start-sec="startSec"
        v-model:end-sec="endSec"
        :src="track.url"
        :segments="segments"
        :pointers="pointers"
        :editing-id="editingId"
        @mark-start="markStart"
        @mark-end="markEnd"
      />
    </div>

    <section
      ref="formEl"
      class="mt-5 rounded-lg border p-4"
      :class="editingId ? 'border-primary/40 bg-accent/30' : 'border-border'"
    >
      <!-- The form does double duty, so it has to say which job it is doing:
           the same fields silently switching from "new shabad" to "revising
           that one" is how somebody overwrites a row they meant to add. -->
      <div
        v-if="editing"
        class="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
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
      <h2 v-else class="mb-4 text-sm font-medium">Add a shabad</h2>

      <!-- Three steps, numbered and ticked as they are satisfied. The fields
           were the same before; what was missing was any sign of how far along
           the current one is, or that a name alone is enough to save. -->
      <div>
        <div class="mb-2 flex flex-wrap items-center gap-x-2">
          <span
            class="grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-medium"
            :class="
              startSec !== null && endSec !== null
                ? 'bg-primary/20 text-primary'
                : 'bg-muted text-muted-foreground'
            "
          >
            <Check v-if="startSec !== null && endSec !== null" class="size-3" />
            <template v-else>1</template>
          </span>
          <h3 class="text-xs font-medium">Mark where it starts and ends</h3>
          <span
            class="w-full pl-7 text-[11px] text-muted-foreground sm:w-auto sm:pl-0"
            >— from the playhead, then nudge</span
          >
        </div>
        <div class="flex flex-wrap items-center gap-2 pl-7">
          <!-- A boundary is rarely right the first time. Both ends can be
               walked in 0.1s and 1s steps rather than re-marked from the
               playhead, and each is clamped so the pair cannot cross. -->
          <BoundaryControl
            v-model="startSec"
            label="Start"
            shortcut="["
            :min="0"
            :max="endSec !== null ? endSec - MIN_LENGTH : duration"
            @mark="markStart"
          />
          <BoundaryControl
            v-model="endSec"
            label="End"
            shortcut="]"
            :min="startSec !== null ? startSec + MIN_LENGTH : 0"
            :max="duration"
            @mark="markEnd"
          />
          <span
            v-if="startSec !== null && endSec !== null"
            class="text-[11px] tabular-nums text-muted-foreground"
          >
            {{ fmt(endSec - startSec) }} long
          </span>
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
      </div>

      <!-- Identifying the shabad is the main act, not an option behind a
           toggle: it is what produces the name, the ang, the author and the
           read-along, and it is the same order the notation editor uses —
           find the shabad first, everything else follows from it. -->
      <div class="mt-5 border-t border-border pt-4">
        <div class="mb-2 flex flex-wrap items-center gap-x-2">
          <span
            class="grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-medium"
            :class="
              shabadId
                ? 'bg-primary/20 text-primary'
                : 'bg-muted text-muted-foreground'
            "
          >
            <Check v-if="shabadId" class="size-3" />
            <template v-else>2</template>
          </span>
          <h3 class="text-xs font-medium">Link the shabad</h3>
          <span
            class="w-full pl-7 text-[11px] text-muted-foreground sm:w-auto sm:pl-0"
            >— optional, but it gives the name, the ang and the read-along</span
          >
        </div>
        <div class="pl-7">
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
      </div>

      <!-- Derived from the anchor line once a shabad is linked, but still
           free text: someone who recognises a shabad by ear without being able
           to find it in BaniDB can type a name and stop there, which is what
           keeps the highest-volume task open to any contributor. -->
      <div class="mt-5 border-t border-border pt-4">
        <div class="mb-2 flex flex-wrap items-center gap-x-2">
          <span
            class="grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-medium"
            :class="
              name.trim()
                ? 'bg-primary/20 text-primary'
                : 'bg-muted text-muted-foreground'
            "
          >
            <Check v-if="name.trim()" class="size-3" />
            <template v-else>3</template>
          </span>
          <Label for="shabad-name" class="text-xs font-medium">Name it</Label>
          <span
            class="w-full pl-7 text-[11px] text-muted-foreground sm:w-auto sm:pl-0"
          >
            {{
              shabadId
                ? '— from the main verse, edit if you’d write it differently'
                : '— required; type what you hear'
            }}
          </span>
        </div>
        <div class="pl-7">
          <Input
            id="shabad-name"
            v-model="name"
            placeholder="Type what you hear, or link a shabad above"
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
          <!-- Optional by design: neither gates saving, and most taggers skip
               them. Raag shows up in the player's search and rows. -->
          <div class="mt-3 flex flex-wrap gap-3">
            <div class="w-40">
              <Label for="shabad-raag" class="text-[11px] text-muted-foreground"
                >Raag — optional</Label
              >
              <Input
                id="shabad-raag"
                v-model="raag"
                placeholder="e.g. Asa"
                class="mt-1 bg-card"
                @keyup.enter="save(false)"
              />
            </div>
            <div class="w-40">
              <Label for="shabad-taal" class="text-[11px] text-muted-foreground"
                >Taal — optional</Label
              >
              <Input
                id="shabad-taal"
                v-model="taal"
                placeholder="e.g. Teentaal"
                class="mt-1 bg-card"
                @keyup.enter="save(false)"
              />
            </div>
          </div>
        </div>
      </div>

      <div
        class="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4"
      >
        <Button size="sm" :disabled="busy || !canSave" @click="save(false)">
          {{ editingId ? 'Update shabad' : 'Save shabad' }}
        </Button>
        <!-- Nothing to offer a published row here: it is already published, and
             the update carries its status through untouched. -->
        <Button
          v-if="editing ? canPublishRow(editing) : canPublish"
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
        <span
          v-if="!canSave"
          class="text-xs text-muted-foreground"
          aria-live="polite"
        >
          {{
            startSec === null || endSec === null
              ? 'Mark both boundaries to save.'
              : !name.trim()
                ? 'A name is all that’s still missing.'
                : 'The end must come after the start.'
          }}
        </span>
        <span v-else class="text-xs text-muted-foreground">
          Only published shabads appear in the player.
        </span>
      </div>
      <p v-if="message" class="mt-2 text-xs text-amber-400" role="alert">
        {{ message }}
      </p>
    </section>

    <template v-if="scanFindings?.length">
      <div class="mt-7 mb-2 flex flex-wrap items-baseline gap-x-2">
        <h2 class="text-xs font-medium tracking-wide uppercase">
          <Sparkles class="mr-1 inline size-3 text-muted-foreground" />
          Scan pointers ({{ scanFindings.length }})
        </h2>
        <!-- The scanner heard these but was not sure enough to draft them —
             below its confidence/margin gates. They are pointers, not tags:
             jump there, listen, and tag by ear if it is real. -->
        <p class="text-[11px] text-muted-foreground">
          Heard but not confident. Nothing is saved until you save it.
        </p>
      </div>
      <ul class="space-y-1">
        <li
          v-for="f in scanFindings"
          :key="`${f.shabad_id}-${f.start}`"
          class="flex items-center gap-2 rounded-md border border-dashed border-border/70 px-2 py-2 sm:gap-3 sm:px-3"
          :class="pointerCovered(f) && 'opacity-55'"
        >
          <Button
            variant="ghost"
            size="icon-sm"
            class="size-7 shrink-0 text-muted-foreground"
            :title="`Listen from ${fmt(f.start, true)}`"
            :aria-label="`Listen from ${fmt(f.start, true)}`"
            @click="player?.seek(Math.max(0, f.start - 5))"
          >
            <Play class="size-3.5" />
          </Button>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm">{{ f.name }}</span>
            <span class="block truncate text-[11px] text-muted-foreground">
              <!-- No shabad id: it is below-gate information wearing a
                   confident badge, and the tagger picks the shabad in search
                   after listening rather than inheriting the scan's guess. -->
              <span :title="`Scanner confidence ${f.confidence}`">
                {{ Math.round(f.confidence * 100) }}% match
              </span>
              <span v-if="pointerCovered(f)"> · already tagged here</span>
            </span>
          </span>
          <span class="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {{ fmt(f.start) }}–{{ fmt(f.end) }}
          </span>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 shrink-0 px-2 text-[11px]"
            title="Load this into the form — listen, adjust, then save it yourself"
            @click="tagFromPointer(f)"
          >
            Tag this
          </Button>
        </li>
      </ul>
    </template>

    <div class="mt-7 mb-2 flex flex-wrap items-baseline gap-x-2">
      <h2 class="text-xs font-medium tracking-wide uppercase">
        Shabads ({{ renditions?.length ?? 0 }})
      </h2>
      <p v-if="renditions?.length" class="text-[11px] text-muted-foreground">
        Click a timestamp to hear the cut either side of it.
      </p>
    </div>

    <Empty
      v-if="!renditions?.length"
      class="gap-4 rounded-lg border border-dashed p-8 md:p-8"
    >
      <EmptyHeader>
        <EmptyMedia variant="icon"><ListMusic /></EmptyMedia>
        <EmptyTitle>Nothing tagged yet</EmptyTitle>
        <EmptyDescription>
          Play the recording, mark where the first shabad starts and ends, then
          name it. Both boundaries can be nudged after you mark them, so a rough
          pass is worth more than a perfect one.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent v-if="scanFindings?.length">
        <p class="text-[11px] text-muted-foreground">
          The scan left {{ scanFindings.length }} pointer{{
            scanFindings.length === 1 ? '' : 's'
          }}
          above — a quick way in.
        </p>
      </EmptyContent>
    </Empty>

    <ul v-else class="space-y-0.5">
      <template v-for="row in listRows" :key="row.key">
        <!-- An untagged stretch, sitting where it falls in the recording. The
             gaps used to be invisible: you could only find them by reading
             timestamps down the list and subtracting. -->
        <li
          v-if="row.kind === 'gap'"
          class="flex flex-wrap items-center gap-x-2 py-1 pl-[4.75rem]"
        >
          <span class="text-[11px] text-muted-foreground/70">
            {{ fmt(row.g.end - row.g.start) }} untagged ·
            <span class="tabular-nums"
              >{{ fmt(row.g.start) }}–{{ fmt(row.g.end) }}</span
            >
          </span>
          <Button
            variant="ghost"
            size="xs"
            class="text-[11px] text-muted-foreground"
            title="Play from the start of the gap"
            @click="player?.playFrom(row.g.start)"
          >
            <Play class="size-3" /> Listen
          </Button>
          <Button
            variant="ghost"
            size="xs"
            class="text-[11px] text-muted-foreground"
            title="Load these boundaries into the form and adjust from there"
            @click="tagGap(row.g)"
          >
            Tag this gap
          </Button>
        </li>

        <li
          v-else
          class="rounded-md transition"
          :class="
            row.s.id === editingId
              ? 'bg-accent ring-1 ring-primary/40'
              : 'hover:bg-accent/60'
          "
        >
          <div class="flex items-center gap-2 px-2 py-2 sm:gap-3">
            <span
              class="hidden w-4 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground/50 sm:block"
            >
              {{ row.n }}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              class="size-7 shrink-0 text-muted-foreground"
              title="Play from here"
              :aria-label="`Play ${row.s.name} from ${fmt(Number(row.s.start_sec))}`"
              @click="player?.playFrom(Number(row.s.start_sec))"
            >
              <Play class="size-3.5" />
            </Button>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm">{{ row.s.name }}</span>
              <span class="block truncate text-[11px] text-muted-foreground">
                {{ rowMeta(row.s) }}
              </span>
            </span>

            <!-- Checking a saved boundary should not require opening the row
                 for editing, and it used to cost two more identical-looking
                 icon buttons per row. The timestamp IS the control: clicking
                 one loops a few seconds either side of that very cut, which
                 puts the action on the number it affects. -->
            <span class="shrink-0 text-xs tabular-nums">
              <button
                type="button"
                class="rounded px-1 py-0.5 text-muted-foreground transition hover:bg-background hover:text-foreground"
                title="Play across the start cut"
                :aria-label="`Play across the start cut at ${fmt(Number(row.s.start_sec))}`"
                @click="player?.auditionBoundary(Number(row.s.start_sec))"
              >
                {{ fmt(Number(row.s.start_sec)) }}
              </button>
              <span class="text-muted-foreground/40">–</span>
              <button
                type="button"
                class="rounded px-1 py-0.5 text-muted-foreground transition hover:bg-background hover:text-foreground"
                title="Play across the end cut"
                :aria-label="`Play across the end cut at ${fmt(Number(row.s.end_sec))}`"
                @click="player?.auditionBoundary(Number(row.s.end_sec))"
              >
                {{ fmt(Number(row.s.end_sec)) }}
              </button>
            </span>
            <span
              class="hidden w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground/60 md:block"
            >
              {{ fmt(Number(row.s.end_sec) - Number(row.s.start_sec)) }}
            </span>

            <!-- A stock Select, because for a reviewer this is a field with two
                 values rather than a menu of actions: it shows the current one
                 and changes it in the same control. -->
            <Select
              v-if="canReview"
              :model-value="
                row.s.status === 'published' ? 'published' : 'unpublished'
              "
              @update:model-value="
                (v: any) => setPublished(row.s, v === 'published')
              "
            >
              <SelectTrigger
                size="sm"
                class="h-7 w-[7.5rem] shrink-0 text-[11px]"
                :class="row.s.status === 'published' && 'text-emerald-400'"
                :aria-label="`Whether ${row.s.name} appears in the player`"
                title="Whether this shabad appears in the player"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="published" class="text-xs">
                  Published
                </SelectItem>
                <SelectItem value="unpublished" class="text-xs">
                  Unpublished
                </SelectItem>
              </SelectContent>
            </Select>
            <!-- Publish permission without review: the policy lets them promote
                 their own draft and then stops matching the row, so this is a
                 one-way button rather than a control that would silently refuse
                 the way back. -->
            <Button
              v-else-if="canPublishRow(row.s)"
              variant="outline"
              size="sm"
              class="h-7 shrink-0 px-2 text-[11px]"
              title="Make this shabad visible in the player"
              @click="setPublished(row.s, true)"
            >
              <Send class="size-3" /> Publish
            </Button>
            <Badge
              v-else
              :variant="row.s.status === 'published' ? 'default' : 'secondary'"
              class="shrink-0 rounded-full text-[11px]"
              :class="
                row.s.status === 'published' &&
                'bg-emerald-500/15 text-emerald-400'
              "
            >
              {{ row.s.status }}
            </Badge>

            <!-- Shown only where the UPDATE policy will actually accept it, so
                 the button never leads to a refused edit. A shabad is usually
                 linked long after its boundaries were marked — somebody who
                 knows the line comes along later — so this is the normal way
                 in, not a repair hatch. -->
            <Button
              v-if="canEdit(row.s)"
              variant="ghost"
              size="icon-sm"
              class="size-7 shrink-0 text-muted-foreground"
              :title="
                row.s.id === editingId
                  ? 'Editing this one'
                  : 'Edit name, shabad or timing'
              "
              :aria-label="`Edit ${row.s.name}`"
              :class="row.s.id === editingId && 'text-primary'"
              @click="edit(row.s)"
            >
              <Pencil class="size-3.5" />
            </Button>
            <Button
              v-if="canDelete"
              variant="ghost"
              size="icon-sm"
              class="size-7 shrink-0 text-muted-foreground hover:text-destructive"
              title="Delete"
              :aria-label="`Delete ${row.s.name}`"
              @click="pendingDelete = row.s"
            >
              <Trash2 class="size-3.5" />
            </Button>
          </div>
          <p
            v-if="rowError[row.s.id]"
            class="px-2 pb-2 pl-9 text-[11px] text-amber-400"
            role="alert"
          >
            {{ rowError[row.s.id] }}
          </p>
        </li>
      </template>
    </ul>

    <!-- The way out when the remainder is not shabads — or when nothing can
         measure it. Gated on the VIEW's coverage number, not this page's gap
         list: the offer must appear exactly where the shelves would hold the
         recording open, including a fully-tagged set whose filename slot
         overestimates its length, and a slot-less recording whose length is
         unknowable. The saying is gated (tracks.mark_done — admin, by
         default): taggers just tag, and the mark moves the recording off
         everyone's In progress shelf, so it stays a review judgment like
         publishing. -->
    <div
      v-if="
        canMarkDone &&
        (renditions?.length ?? 0) > 0 &&
        (taggingDone || shelfCoverageOpen)
      "
      class="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-dashed border-border/70 px-3 py-2.5"
    >
      <!-- The mark and publishing are independent: Done also needs a
           published shabad, so the copy on both sides says which of the two
           is still missing rather than promising a shelf move the filters
           would refuse. -->
      <template v-if="taggingDone">
        <Check class="size-3.5 shrink-0 text-emerald-400" />
        <span class="text-xs text-muted-foreground">
          {{
            publishedCount > 0
              ? 'Marked fully tagged — the recordings list counts it done despite the untagged stretches.'
              : 'Marked fully tagged — the recordings list counts it done once a shabad here is published.'
          }}
        </span>
        <Button
          variant="ghost"
          size="sm"
          class="h-7 px-2 text-[11px] text-muted-foreground"
          :disabled="doneBusy"
          @click="setTaggingDone(false)"
        >
          Unmark
        </Button>
      </template>
      <template v-else>
        <span class="text-xs text-muted-foreground">
          {{
            track?.untagged_seconds === null
              ? 'This recording has no slot in its filename, so nothing can measure what is left. When you have listened to the end, say so'
              : 'Nothing left worth tagging? If what remains is announcements, simran or silence — or the recording simply runs shorter than its slot — say so'
          }}
          {{
            publishedCount > 0
              ? 'and it counts as done.'
              : 'and it counts as done once a shabad here is published.'
          }}
        </span>
        <Button
          variant="outline"
          size="sm"
          class="h-7 px-2 text-[11px]"
          :disabled="doneBusy"
          @click="setTaggingDone(true)"
        >
          <Check class="size-3.5" /> Mark fully tagged
        </Button>
      </template>
      <p
        v-if="doneError"
        class="w-full text-[11px] text-amber-400"
        role="alert"
      >
        {{ doneError }}
      </p>
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
          <!-- A plain Button, not AlertDialogAction. The action primitive is a
               dialog close: it runs its own close before our click handler, and
               closing is what clears `pendingDelete`, so the handler would find
               nothing left to delete. This closes the dialog by doing the work
               instead. -->
          <Button variant="destructive" @click="confirmRemove">
            Delete shabad
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
