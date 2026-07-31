<script setup lang="ts">
import { usePlayer, formatTime } from '~/composables/usePlayer';

const props = defineProps<{ track: any }>();
const player = usePlayer();

// The filename slot gives a nominal length for free (e.g. "12.00pm to 1.10pm"),
// so rows show a duration without a single extra network request.
const slotLength = computed(() => {
  const { slot_start_sec: a, slot_end_sec: b } = props.track;
  return a != null && b != null && b > a ? formatTime(b - a) : null;
});

const isCurrent = computed(() => player.current.value?.id === props.track.id);
</script>

<template>
  <button
    class="w-full text-left px-3 py-2.5 rounded flex items-center gap-3 hover:bg-neutral-900"
    :class="isCurrent && 'bg-neutral-900'"
    @click="player.play({
      id: track.id,
      title: track.title ?? track.raw_filename.replace(/\.[^.]+$/, ''),
      subtitle: track.artist_dir ?? undefined,
      url: track.url,
    })"
  >
    <span class="w-4 shrink-0 text-xs text-neutral-500">
      {{ isCurrent && player.playing.value ? '▶' : '' }}
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-sm">
        {{ track.title ?? track.raw_filename.replace(/\.[^.]+$/, '') }}
      </span>
      <span class="block truncate text-xs text-neutral-500">
        {{ [track.artist_dir, track.date].filter(Boolean).join(' · ') }}
      </span>
    </span>
    <span v-if="slotLength" class="shrink-0 text-xs tabular-nums text-neutral-500">
      {{ slotLength }}
    </span>
  </button>
</template>
