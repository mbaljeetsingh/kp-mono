<script setup lang="ts">
import { Play } from 'lucide-vue-next';
import { usePlayer, formatTime } from '~/composables/usePlayer';

const props = defineProps<{
  shabad: any;
  index?: number;
  /** The full list this row belongs to, so playing one queues the rest. */
  list?: any[];
}>();

const player = usePlayer();
const isCurrent = computed(() => player.current.value?.id === props.shabad.id);

function toPlayable(s: any) {
  return {
    id: s.id,
    title: s.name,
    subtitle: s.artist ?? undefined,
    url: s.url,
    startSec: Number(s.start_sec),
    endSec: Number(s.end_sec),
  };
}

function play() {
  const list = props.list ?? [props.shabad];
  const at = list.findIndex((x) => x.id === props.shabad.id);
  player.playList(list.map(toPlayable), Math.max(at, 0));
}
</script>

<template>
  <button
    class="group grid w-full grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-md px-3 py-2 text-left transition hover:bg-white/5"
    :class="isCurrent && 'bg-white/5'"
    @click="play"
  >
    <span class="grid place-items-center text-xs tabular-nums text-neutral-500">
      <Play
        v-if="isCurrent && player.playing.value"
        class="size-3.5 fill-current text-amber-400"
      />
      <template v-else>
        <span class="group-hover:hidden">{{
          index != null ? index + 1 : ''
        }}</span>
        <Play
          class="hidden size-3.5 fill-current text-neutral-100 group-hover:block"
        />
      </template>
    </span>
    <span class="min-w-0">
      <span
        class="block truncate text-sm"
        :class="isCurrent ? 'text-amber-400' : 'text-neutral-100'"
      >
        {{ shabad.name }}
      </span>
      <span class="block truncate text-xs text-neutral-500">
        {{
          [shabad.artist, shabad.raag, shabad.date].filter(Boolean).join(' · ')
        }}
      </span>
    </span>
    <span class="text-xs tabular-nums text-neutral-500">
      {{ formatTime(Number(shabad.duration_sec)) }}
    </span>
  </button>
</template>
