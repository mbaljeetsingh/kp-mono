<script setup lang="ts">
import { Play, Pause, Rewind, FastForward, Repeat } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { SELECTED_SEGMENT } from '@/lib/segmented';
import { useTagPlayer, fmt, MIN_LENGTH, SPEEDS } from '~/composables/useTagPlayer';

const props = defineProps<{ src: string }>();

// The segment being marked, mirrored onto the seek bar as draggable handles.
// Dragging is for coarse placement — getting a cut into the right minute of a
// 70-minute set — while the BoundaryControl nudges stay the way to walk it
// into place by tenths. Optional, so the transport works without them.
const startSec = defineModel<number | null>('startSec', { default: null });
const endSec = defineModel<number | null>('endSec', { default: null });

const player = useTagPlayer();
const audio = useTemplateRef<HTMLAudioElement>('audio');

onMounted(() => {
  if (audio.value) player.attach(audio.value);
});

defineExpose({ player });

function scrub(event: Event) {
  const pct = Number((event.target as HTMLInputElement).value);
  player.seek((player.duration.value * pct) / 100);
}

const bar = useTemplateRef<HTMLElement>('bar');

/** Where a boundary sits on the bar, as a percentage — null hides the handle
 *  until the boundary is marked and the duration is known. */
function pct(v: number | null) {
  const d = player.duration.value;
  if (v === null || !d) return null;
  return Math.min(100, Math.max(0, (v / d) * 100));
}
const startPct = computed(() => pct(startSec.value));
const endPct = computed(() => pct(endSec.value));

function dragBoundary(which: 'start' | 'end', down: PointerEvent) {
  const rect = bar.value?.getBoundingClientRect();
  const d = player.duration.value;
  if (!rect || !d) return;
  const handle = down.currentTarget as HTMLElement;
  // Capture keeps the drag alive once the pointer leaves the 6px handle,
  // which it does immediately — and on touch, `touch-none` on the handle is
  // what stops the page scrolling instead.
  handle.setPointerCapture(down.pointerId);
  // Where the boundary sat when the drag began, so the teardown can tell a
  // real move from a stray click — only a move earns the audition below.
  const before = which === 'start' ? startSec.value : endSec.value;
  const place = (e: PointerEvent) => {
    const sec = ((e.clientX - rect.left) / rect.width) * d;
    // The 0-floor is applied last: with endSec marked inside the first tenth
    // of a second, the upper bound goes negative and floor-then-min would
    // write a negative startSec — which the DB rejects at save
    // (check start_sec >= 0), long after the drag that caused it.
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
      // A drag is placed by ear: loop across wherever the handle landed, so
      // the very next thing heard is whether the cut falls in the gap.
      const after = which === 'start' ? startSec.value : endSec.value;
      if (after !== null && after !== before) player.auditionBoundary(after);
    },
    { once: true }
  );
}

// Hands stay on the keyboard: a tagger who has to reach for the mouse between
// every cut tags a fraction as much.
function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
  const fine = e.shiftKey;
  switch (e.key) {
    case ' ':
      e.preventDefault();
      player.toggle();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      player.skip(fine ? -0.1 : -10);
      break;
    case 'ArrowRight':
      e.preventDefault();
      player.skip(fine ? 0.1 : 10);
      break;
    case 'ArrowUp':
      e.preventDefault();
      player.cycleSpeed(1);
      break;
    case 'ArrowDown':
      e.preventDefault();
      player.cycleSpeed(-1);
      break;
  }
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="rounded-lg border border-border p-4">
    <audio
      ref="audio"
      :src="props.src"
      preload="metadata"
      @timeupdate="player.onTimeUpdate"
      @loadedmetadata="player.onLoadedMetadata"
      @play="player.playing.value = true"
      @pause="player.playing.value = false"
    />

    <div class="flex items-center gap-3">
      <Button
        size="icon-sm"
        class="shrink-0 rounded-full"
        title="Play/pause (space)"
        @click="player.toggle"
      >
        <Pause v-if="player.playing.value" class="size-4 fill-current" />
        <Play v-else class="size-4 translate-x-px fill-current" />
      </Button>
      <span class="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">
        {{ fmt(player.currentTime.value, true) }}
      </span>
      <!-- The wrapper exists so the boundary overlays share the input's
           coordinate space. Anything not on a handle falls through to the
           range input, so click-to-seek is untouched. -->
      <div ref="bar" class="relative min-w-0 flex-1">
        <input
          type="range"
          min="0"
          max="100"
          step="0.01"
          :value="player.progress.value"
          class="block h-1 w-full accent-primary"
          @input="scrub"
        />
        <!-- The marked segment's extent, painted under the handles. -->
        <div
          v-if="startPct !== null && endPct !== null"
          class="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary/25"
          :style="{ left: `${startPct}%`, width: `${endPct - startPct}%` }"
        />
        <div
          v-if="startPct !== null"
          class="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-primary ring-1 ring-background"
          :style="{ left: `${startPct}%` }"
          :title="`Start ${fmt(startSec, true)} — drag to move`"
          @pointerdown.prevent="dragBoundary('start', $event)"
        />
        <div
          v-if="endPct !== null"
          class="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-primary ring-1 ring-background"
          :style="{ left: `${endPct}%` }"
          :title="`End ${fmt(endSec, true)} — drag to move`"
          @pointerdown.prevent="dragBoundary('end', $event)"
        />
      </div>
      <span
        class="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground"
      >
        {{ fmt(player.duration.value) }}
      </span>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <!-- Skips read as one control, so they group rather than float apart. -->
      <ButtonGroup aria-label="Skip">
        <Button
          variant="outline"
          size="sm"
          class="text-xs"
          title="Back 30s (←←)"
          @click="player.skip(-30)"
        >
          <Rewind class="size-3.5" /> 30
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="text-xs"
          title="Back 10s (←)"
          @click="player.skip(-10)"
        >
          <Rewind class="size-3.5" /> 10
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="text-xs"
          title="Forward 10s (→)"
          @click="player.skip(10)"
        >
          10 <FastForward class="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="text-xs"
          title="Forward 30s"
          @click="player.skip(30)"
        >
          30 <FastForward class="size-3.5" />
        </Button>
      </ButtonGroup>

      <ButtonGroup class="ml-2" aria-label="Playback speed">
        <Button
          v-for="s in SPEEDS"
          :key="s"
          size="sm"
          variant="outline"
          :aria-pressed="player.speed.value === s"
          :class="['px-2 text-[11px]', SELECTED_SEGMENT]"
          @click="player.setSpeed(s)"
        >
          {{ s }}x
        </Button>
      </ButtonGroup>

      <Button
        v-if="player.loop.value"
        variant="outline"
        size="sm"
        class="text-xs text-amber-400"
        title="Stop looping"
        @click="player.stopLoop"
      >
        <Repeat class="size-3.5" /> Looping
      </Button>

      <span class="ml-auto hidden text-[11px] text-muted-foreground lg:inline">
        space · ← → 10s · shift+← → 0.1s · ↑ ↓ speed
      </span>
    </div>
  </div>
</template>
