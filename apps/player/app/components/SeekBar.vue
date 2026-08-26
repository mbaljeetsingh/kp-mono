<script setup lang="ts">
/**
 * The scrubber, for both breakpoints.
 *
 * Mobile used to get a 2px unstyled `<div>` painted to the segment's progress —
 * readable only if you knew to look for it, and impossible to move, so a phone
 * could play a 70-minute set with no way to reach minute 40 of it. This is one
 * control used at both sizes instead: same behaviour on a mouse and a thumb,
 * with the paint thin and the hit area 24px tall, which is what a finger needs.
 *
 * Pointer events rather than a native `<input type="range">` — the pattern
 * admin's TrackTimeline uses. A range input's drag on iOS Safari starts only
 * from the thumb, so a 12px target would be the whole scrubbing story on the
 * platform this is being fixed for; `setPointerCapture` from anywhere on the
 * track behaves identically everywhere. Keyboard and ARIA are then ours to
 * carry, which is what `role="slider"` and `onKey` below are.
 */
import { formatTime } from '~/composables/usePlayer';

const props = defineProps<{
  /** Where playback is, 0–100 across the segment. */
  progress: number;
  /** Seconds into the segment, for the leading label. */
  elapsed: number;
  /** Length of the segment — of the file, when nothing is tagged. */
  total: number;
  disabled?: boolean;
  /**
   * The full-screen treatment: a heavier line, a bigger thumb, and the clock
   * under the bar rather than either side of it, which is what a scrubber
   * with a whole screen to itself should look like.
   */
  expanded?: boolean;
}>();

/** Emitted once per gesture, as a percentage: only the parent knows which
 *  window of which file the segment is, so it does the mapping to seconds. */
const emit = defineEmits<{ seek: [pct: number] }>();

const bar = useTemplateRef<HTMLElement>('bar');

/** Nothing to scrub before the duration is known — a whole file has none until
 *  `loadedmetadata` lands, and a dead control should not look live. */
const inert = computed(() => props.disabled || !(props.total > 0));

/**
 * Where the gesture has dragged to, or null when no gesture is running.
 *
 * The bar follows the finger while it is down, not `timeupdate`: mirroring
 * playback mid-drag would pull the thumb out from under the finger four times a
 * second. It also means the seek is committed once, on release, instead of
 * firing a range request per pointermove.
 */
const draft = ref<number | null>(null);

const pct = computed(() =>
  Math.min(100, Math.max(0, draft.value ?? props.progress))
);

/** The leading label reads the drag while there is one, so a scrub says where
 *  it is going before it goes there. */
const shownElapsed = computed(() =>
  draft.value === null ? props.elapsed : (props.total * draft.value) / 100
);

function pctAt(clientX: number): number {
  const rect = bar.value?.getBoundingClientRect();
  if (!rect?.width) return 0;
  return Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
}

function drag(down: PointerEvent) {
  if (inert.value) return;
  const el = down.currentTarget as HTMLElement;
  // Capture keeps the drag alive once the pointer leaves the 24px band, which
  // a thumb does immediately; `touch-none` on the same element is what stops
  // the page treating the sideways drag as a scroll.
  el.setPointerCapture(down.pointerId);
  draft.value = pctAt(down.clientX);
  const place = (e: PointerEvent) => {
    draft.value = pctAt(e.clientX);
  };
  el.addEventListener('pointermove', place);
  // Fires for pointerup and pointercancel alike, so one listener tears down —
  // and a tap that never moved commits the position it landed on, which is
  // tap-to-seek for free.
  el.addEventListener(
    'lostpointercapture',
    () => {
      el.removeEventListener('pointermove', place);
      const p = draft.value;
      draft.value = null;
      if (p !== null) emit('seek', p);
    },
    { once: true }
  );
}

/** Ten seconds, the step the app's arrow-key shortcuts already use. */
const SEEK_STEP = 10;

function onKey(event: KeyboardEvent) {
  if (inert.value) return;
  const step = (SEEK_STEP / props.total) * 100;
  let next: number | null = null;
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowUp':
      next = pct.value + step;
      break;
    case 'ArrowLeft':
    case 'ArrowDown':
      next = pct.value - step;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = 100;
      break;
  }
  // Everything else still belongs to the transport — space must keep pausing
  // while the scrubber holds focus.
  if (next === null) return;
  event.preventDefault();
  // usePlayerKeys listens on window and treats arrows as a seek too. Without
  // this the press would move the playhead twice.
  event.stopPropagation();
  emit('seek', Math.min(100, Math.max(0, next)));
}
</script>

<template>
  <div
    class="select-none"
    :class="expanded ? 'flex flex-col gap-1.5' : 'flex items-center gap-2'"
  >
    <span
      v-if="!expanded"
      class="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground"
    >
      {{ formatTime(shownElapsed) }}
    </span>

    <!-- The band is the target and the line inside it is the paint: a 4px bar
         is the right weight to read and the wrong one to hit. -->
    <div
      ref="bar"
      class="group relative flex touch-none items-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      :class="[
        inert ? 'cursor-default' : 'cursor-pointer',
        // `flex-1` belongs to the inline layout only. Down a column it resolves
        // against the cross axis instead, zeroing the flex basis, and the band
        // collapses to the height of the line inside it — an 8px target, which
        // is the very thing the band exists to prevent.
        expanded ? 'h-8 w-full' : 'h-6 min-w-0 flex-1',
      ]"
      role="slider"
      :tabindex="inert ? -1 : 0"
      :aria-disabled="inert || undefined"
      aria-label="Seek within this shabad"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(pct)"
      :aria-valuetext="`${formatTime(shownElapsed)} of ${formatTime(total)}`"
      @pointerdown="drag"
      @keydown="onKey"
    >
      <div
        class="w-full overflow-hidden rounded-full bg-muted transition-[height]"
        :class="expanded ? 'h-2' : 'h-1.5 md:h-1 md:group-hover:h-1.5'"
      >
        <div
          class="h-full rounded-full bg-primary"
          :style="{ width: `${pct}%` }"
        />
      </div>
      <!-- Always drawn rather than revealed on hover: a phone has no hover, and
           the thumb is the part that says the line can be moved at all. -->
      <span
        v-if="!inert"
        class="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-sm transition-transform"
        :class="
          expanded ? 'size-4' : 'size-3.5 md:size-3 md:group-hover:scale-125'
        "
        :style="{ left: `${pct}%` }"
      />
    </div>

    <span
      v-if="!expanded"
      class="w-9 shrink-0 text-[11px] tabular-nums text-muted-foreground"
    >
      {{ formatTime(total) }}
    </span>

    <!-- Under the bar in the full-screen view, where the bar wants the whole
         width and there is room for a legible clock beneath it. -->
    <div
      v-if="expanded"
      class="flex items-center justify-between text-xs tabular-nums text-muted-foreground"
    >
      <span>{{ formatTime(shownElapsed) }}</span>
      <span>{{ formatTime(total) }}</span>
    </div>
  </div>
</template>
