<script setup lang="ts">
/**
 * The recording end to end: what is already tagged, what the scan is pointing
 * at, where the playhead sits, and the cut being marked right now.
 *
 * Every decision on this page answers one question — which minutes still need
 * somebody? The thin seek bar this replaces could not answer it: saved work
 * existed only as timestamps in the list below, so finding the gaps meant
 * reading rows and doing arithmetic against a 35-minute duration. Painting the
 * segments on the same axis as the playhead makes the gaps the most obvious
 * thing on the page, which is the whole point.
 *
 * Seeking stays a real `<input type="range">` underneath the paint: it carries
 * click-to-seek, arrow keys and a focus ring for free, and none of the layers
 * above it take pointer events except the two drag handles.
 */
import { MIN_LENGTH, fmt } from '~/composables/useTagPlayer';
import type { TimelineSegment, TimelinePointer } from '@/lib/timeline';

const props = withDefaults(
  defineProps<{
    duration: number;
    currentTime: number;
    segments?: TimelineSegment[];
    pointers?: TimelinePointer[];
    /** The row open in the form, ringed so form and timeline stay linked. */
    editingId?: string | null;
  }>(),
  { segments: () => [], pointers: () => [], editingId: null }
);

// The cut being marked, mirrored here as a band with draggable ends. Dragging
// is for coarse placement — getting a boundary into the right minute of a long
// set — while BoundaryControl's nudges walk it in by tenths.
const startSec = defineModel<number | null>('startSec', { default: null });
const endSec = defineModel<number | null>('endSec', { default: null });

const emit = defineEmits<{ seek: [number]; audition: [number] }>();

const bar = useTemplateRef<HTMLElement>('bar');
const ready = computed(() => props.duration > 0);

/** Position on the axis as a percentage; null while the duration is unknown. */
function pct(v: number | null): number | null {
  if (v === null || !Number.isFinite(v) || !props.duration) return null;
  return Math.min(100, Math.max(0, (v / props.duration) * 100));
}

const startPct = computed(() => pct(startSec.value));
const endPct = computed(() => pct(endSec.value));
const playPct = computed(() => pct(props.currentTime) ?? 0);

/** A saved or suggested span as CSS, with a floor so a 20-second shabad in a
 *  70-minute set is still visible rather than a sub-pixel sliver. */
function span(start: number, end: number) {
  const left = pct(start) ?? 0;
  const right = pct(end) ?? 0;
  return { left: `${left}%`, width: `${Math.max(0.35, right - left)}%` };
}

// Enough ticks to read the axis, few enough to stay legible — which depends on
// how wide the axis actually is, not only on how long the recording is. Picking
// the step from duration alone printed "10:0015:0020:00" once the sidebar-less
// narrow layout squeezed the bar.
const { width } = useElementSize(bar);
const TICK_STEPS = [30, 60, 120, 300, 600, 1800];
const ticks = computed(() => {
  if (!ready.value) return [];
  const room = Math.max(2, Math.floor((width.value || 640) / 76));
  const step =
    TICK_STEPS.find((s) => props.duration / s <= room) ?? TICK_STEPS.at(-1)!;
  const out: number[] = [];
  // Interior ticks only — the transport already prints 0:00 and the duration
  // either side of this bar, and a label at 100% would hang off the edge.
  for (let t = step; t < props.duration * 0.97; t += step) out.push(t);
  return out;
});

function scrub(event: Event) {
  const p = Number((event.target as HTMLInputElement).value);
  emit('seek', (props.duration * p) / 100);
}

function dragBoundary(which: 'start' | 'end', down: PointerEvent) {
  const rect = bar.value?.getBoundingClientRect();
  const d = props.duration;
  if (!rect || !d) return;
  const handle = down.currentTarget as HTMLElement;
  // Capture keeps the drag alive once the pointer leaves the handle, which it
  // does immediately — and `touch-none` on the handle is what stops the page
  // scrolling instead on a touchscreen.
  handle.setPointerCapture(down.pointerId);
  // Where the boundary sat when the drag began, so teardown can tell a real
  // move from a stray click — only a move earns the audition.
  const before = which === 'start' ? startSec.value : endSec.value;
  const place = (e: PointerEvent) => {
    const sec = ((e.clientX - rect.left) / rect.width) * d;
    // The 0-floor is applied last: with endSec marked inside the first tenth of
    // a second the upper bound goes negative, and floor-then-min would write a
    // negative startSec — which the DB rejects at save (check start_sec >= 0),
    // long after the drag that caused it.
    const clamped =
      which === 'start'
        ? Math.max(0, Math.min(sec, (endSec.value ?? d) - MIN_LENGTH))
        : Math.min(Math.max((startSec.value ?? 0) + MIN_LENGTH, sec), d);
    // Two decimals matches what save() writes, so a drag cannot leave
    // 12.299999999 behind for the nudges to inherit.
    const v = Math.round(clamped * 100) / 100;
    if (which === 'start') startSec.value = v;
    else endSec.value = v;
  };
  handle.addEventListener('pointermove', place);
  // Fires on pointerup and pointercancel alike, so one listener tears down.
  handle.addEventListener(
    'lostpointercapture',
    () => {
      handle.removeEventListener('pointermove', place);
      // A drag is placed by ear: loop across wherever the handle landed, so the
      // very next thing heard is whether the cut falls in the gap.
      const after = which === 'start' ? startSec.value : endSec.value;
      if (after !== null && after !== before) emit('audition', after);
    },
    { once: true }
  );
}
</script>

<template>
  <div class="select-none">
    <div ref="bar" class="relative h-9">
      <!-- Seek surface. Invisible but real, so click-to-seek and arrow keys
           come from the platform; the focus ring is drawn by the track below
           because an opacity-0 element cannot show one itself. -->
      <input
        type="range"
        min="0"
        max="100"
        step="0.01"
        :value="ready ? (currentTime / duration) * 100 : 0"
        :disabled="!ready"
        aria-label="Seek"
        :aria-valuetext="fmt(currentTime, true)"
        class="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-default"
        @input="scrub"
      />

      <div
        class="pointer-events-none absolute inset-0 overflow-hidden rounded-md bg-muted/60 ring-1 ring-border/70 ring-inset peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
      >
        <!-- Published reads emerald and unpublished amber, the same pairing the
             recordings list and the row badges use, so "done" means one colour
             everywhere in the admin. -->
        <div
          v-for="s in segments"
          :key="s.id"
          class="absolute inset-y-0 flex items-center overflow-hidden rounded-sm px-1.5"
          :class="[
            s.published
              ? 'bg-emerald-500/25 ring-1 ring-emerald-400/40 ring-inset'
              : 'bg-amber-500/20 ring-1 ring-amber-400/35 ring-inset',
            s.id === editingId && 'ring-2 ring-primary',
          ]"
          :style="span(s.start, s.end)"
        >
          <span
            class="truncate text-[10px] leading-none"
            :class="s.published ? 'text-emerald-200/90' : 'text-amber-200/90'"
          >
            {{ s.name }}
          </span>
        </div>

        <!-- The cut being marked. Terracotta because it is the live thing on
             the page, and drawn over the saved blocks so an overlap is visible
             rather than hidden underneath. -->
        <div
          v-if="startPct !== null && endPct !== null"
          class="absolute inset-y-0 rounded-sm bg-primary/30 ring-1 ring-primary/70 ring-inset"
          :style="{
            left: `${startPct}%`,
            width: `${Math.max(0.35, endPct - startPct)}%`,
          }"
        />
      </div>

      <!-- Playhead over everything, with a nub at the top so it reads as a
           position rather than a divider between two blocks. -->
      <div
        v-if="ready"
        class="pointer-events-none absolute -top-1 -bottom-1 z-20 w-px bg-foreground/80"
        :style="{ left: `${playPct}%` }"
      >
        <span
          class="absolute -top-px -left-[3px] size-[7px] rounded-full bg-foreground"
        />
      </div>

      <!-- Handles last, and the only layer that takes pointer events besides
           the seek surface — a drag must never fall through to a seek. -->
      <button
        v-if="startPct !== null"
        type="button"
        class="absolute top-1/2 z-30 h-11 w-2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-primary ring-1 ring-background focus-visible:ring-2 focus-visible:ring-ring"
        :style="{ left: `${startPct}%` }"
        :aria-label="`Segment start ${fmt(startSec, true)} — drag to move`"
        :title="`Start ${fmt(startSec, true)} — drag to move`"
        @pointerdown.prevent="dragBoundary('start', $event)"
      />
      <button
        v-if="endPct !== null"
        type="button"
        class="absolute top-1/2 z-30 h-11 w-2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-primary ring-1 ring-background focus-visible:ring-2 focus-visible:ring-ring"
        :style="{ left: `${endPct}%` }"
        :aria-label="`Segment end ${fmt(endSec, true)} — drag to move`"
        :title="`End ${fmt(endSec, true)} — drag to move`"
        @pointerdown.prevent="dragBoundary('end', $event)"
      />
    </div>

    <!-- Scan pointers get their own lane rather than a shade of the blocks
         above. They are suggestions nobody has listened to yet, and the axis
         should not let them be mistaken for tagged minutes. -->
    <div v-if="pointers.length" class="relative mt-1 h-1.5">
      <div
        v-for="(p, i) in pointers"
        :key="`${p.start}-${i}`"
        class="absolute inset-y-0 rounded-full bg-muted-foreground/45"
        :style="span(p.start, p.end)"
        :title="`Scan pointer: ${p.name} · ${fmt(p.start)}–${fmt(p.end)}`"
      />
    </div>

    <div v-if="ticks.length" class="relative mt-1 h-3">
      <span
        v-for="t in ticks"
        :key="t"
        class="absolute -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground/60"
        :style="{ left: `${pct(t)}%` }"
      >
        {{ fmt(t) }}
      </span>
    </div>
  </div>
</template>
