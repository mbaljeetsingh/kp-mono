<script setup lang="ts">
import { Play, Pause, Repeat } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TimelineSegment, TimelinePointer } from '@/lib/timeline';
import { useTagPlayer, fmt, SPEEDS } from '~/composables/useTagPlayer';

const props = withDefaults(
  defineProps<{
    src: string;
    /** Painted on the axis so the transport also answers "what is left?". */
    segments?: TimelineSegment[];
    pointers?: TimelinePointer[];
    editingId?: string | null;
  }>(),
  { segments: () => [], pointers: () => [], editingId: null }
);

// The segment being marked, mirrored onto the timeline as draggable ends.
// Optional, so the transport works without them.
const startSec = defineModel<number | null>('startSec', { default: null });
const endSec = defineModel<number | null>('endSec', { default: null });

// Marking is the highest-frequency act on this page and it reads the playhead,
// so it belongs to the transport's keyboard map even though the boundaries
// themselves live in the form below.
const emit = defineEmits<{ markStart: []; markEnd: [] }>();

const player = useTagPlayer();
const audio = useTemplateRef<HTMLAudioElement>('audio');

onMounted(() => {
  if (audio.value) player.attach(audio.value);
});

defineExpose({ player });

// Hands stay on the keyboard: a tagger who has to reach for the mouse between
// every cut tags a fraction as much.
function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
    return;
  // Widgets that own the same keys. The speed dropdown answers to ↑ ↓ itself,
  // and the delete dialog to space — driving the transport from inside either
  // one means both things happen at once.
  // Guarded on `closest` existing: with nothing focused the target is the
  // document rather than an element, and calling it there throws — taking the
  // whole handler down before it reaches a single shortcut.
  if (
    typeof t.closest === 'function' &&
    t.closest(
      '[role="combobox"],[role="listbox"],[role="menu"],[role="dialog"],[role="alertdialog"]'
    )
  )
    return;
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
    // Brackets, as every editor that trims media uses them.
    case '[':
      e.preventDefault();
      emit('markStart');
      break;
    case ']':
      e.preventDefault();
      emit('markEnd');
      break;
  }
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div>
    <audio
      ref="audio"
      :src="props.src"
      preload="metadata"
      @timeupdate="player.onTimeUpdate"
      @loadedmetadata="player.onLoadedMetadata"
      @play="player.playing.value = true"
      @pause="player.playing.value = false"
    />

    <!-- One row on a real screen. On a phone the fixed-width clocks left the
         axis 185px wide — one ruler tick and unreadable segment labels — so the
         timeline claims its own full-width line and the clocks share the first. -->
    <div class="flex flex-wrap items-start gap-x-3 gap-y-1">
      <Button
        size="icon-sm"
        class="mt-0.5 shrink-0 rounded-full"
        :title="player.playing.value ? 'Pause (space)' : 'Play (space)'"
        :aria-label="player.playing.value ? 'Pause' : 'Play'"
        @click="player.toggle"
      >
        <Pause v-if="player.playing.value" class="size-4 fill-current" />
        <Play v-else class="size-4 translate-x-px fill-current" />
      </Button>
      <span
        class="mt-2.5 w-14 shrink-0 text-xs tabular-nums text-muted-foreground"
      >
        {{ fmt(player.currentTime.value, true) }}
      </span>
      <TrackTimeline
        v-model:start-sec="startSec"
        v-model:end-sec="endSec"
        class="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1"
        :duration="player.duration.value"
        :current-time="player.currentTime.value"
        :segments="props.segments"
        :pointers="props.pointers"
        :editing-id="props.editingId"
        @seek="player.seek"
        @audition="player.auditionBoundary"
      />
      <span
        class="mt-2.5 ml-auto w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:ml-0"
      >
        {{ fmt(player.duration.value) }}
      </span>
    </div>

    <div class="mt-2.5 flex flex-wrap items-center gap-2">
      <!-- Speed is a setting you pick once and forget, not a control you work:
           six always-visible segments spent a third of the transport saying so.
           The arrow keys still cycle it, which is how it actually gets changed
           mid-listen. -->
      <Select
        :model-value="String(player.speed.value)"
        @update:model-value="(v: any) => player.setSpeed(Number(v))"
      >
        <SelectTrigger
          size="sm"
          class="h-7 w-[4.75rem] text-[11px]"
          aria-label="Playback speed"
          title="Playback speed (↑ ↓)"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="s in SPEEDS"
            :key="s"
            :value="String(s)"
            class="text-xs"
          >
            {{ s }}x
          </SelectItem>
        </SelectContent>
      </Select>

      <!-- Looping is a mode with no other way out, so its exit is always
           visible while it is on rather than living in a menu. -->
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

      <!-- The skip buttons that used to sit here did exactly what the arrow keys
           do, so the keys are the control now and this is no longer a footnote:
           it is the only place that says how to move through a recording. -->
      <span class="ml-auto text-[11px] text-muted-foreground">
        <span class="text-foreground/70">space</span> play ·
        <span class="text-foreground/70">← →</span> 10s ·
        <span class="text-foreground/70">shift+← →</span> 0.1s ·
        <span class="text-foreground/70">↑ ↓</span> speed ·
        <span class="text-foreground/70">[ ]</span> mark start/end
      </span>
    </div>
  </div>
</template>
