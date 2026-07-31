<script setup lang="ts">
import { Play, Pause, Rewind, FastForward, Repeat } from 'lucide-vue-next';
import { useTagPlayer, fmt, SPEEDS } from '~/composables/useTagPlayer';

const props = defineProps<{ src: string }>();
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
      <button
        class="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
        title="Play/pause (space)"
        @click="player.toggle"
      >
        <Pause v-if="player.playing.value" class="size-4 fill-current" />
        <Play v-else class="size-4 translate-x-px fill-current" />
      </button>
      <span class="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">
        {{ fmt(player.currentTime.value, true) }}
      </span>
      <input
        type="range"
        min="0"
        max="100"
        step="0.01"
        :value="player.progress.value"
        class="h-1 flex-1 accent-primary"
        @input="scrub"
      />
      <span
        class="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground"
      >
        {{ fmt(player.duration.value) }}
      </span>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <button
        class="rounded-md border border-input px-2.5 py-1.5 text-xs hover:bg-accent"
        title="Back 30s (←←)"
        @click="player.skip(-30)"
      >
        <Rewind class="inline size-3.5" /> 30
      </button>
      <button
        class="rounded-md border border-input px-2.5 py-1.5 text-xs hover:bg-accent"
        title="Back 10s (←)"
        @click="player.skip(-10)"
      >
        <Rewind class="inline size-3.5" /> 10
      </button>

      <button
        class="rounded-md border border-input px-2.5 py-1.5 text-xs hover:bg-accent"
        title="Forward 10s (→)"
        @click="player.skip(10)"
      >
        10 <FastForward class="inline size-3.5" />
      </button>
      <button
        class="rounded-md border border-input px-2.5 py-1.5 text-xs hover:bg-accent"
        title="Forward 30s"
        @click="player.skip(30)"
      >
        30 <FastForward class="inline size-3.5" />
      </button>

      <div class="ml-2 flex overflow-hidden rounded-md border border-input">
        <button
          v-for="s in SPEEDS"
          :key="s"
          class="px-2 py-1.5 text-[11px] transition"
          :class="
            player.speed.value === s
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="player.setSpeed(s)"
        >
          {{ s }}x
        </button>
      </div>

      <button
        v-if="player.loop.value"
        class="flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1.5 text-xs text-amber-400"
        title="Stop looping"
        @click="player.stopLoop"
      >
        <Repeat class="size-3.5" /> Looping
      </button>

      <span class="ml-auto hidden text-[11px] text-muted-foreground lg:inline">
        space · ← → 10s · shift+← → 0.1s · ↑ ↓ speed
      </span>
    </div>
  </div>
</template>
