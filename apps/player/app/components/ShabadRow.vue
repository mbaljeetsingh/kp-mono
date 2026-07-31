<script setup lang="ts">
import { Play, Heart } from 'lucide-vue-next';
import { usePlayer, formatTime } from '~/composables/usePlayer';

const props = defineProps<{
  shabad: any;
  index?: number;
  /** The full list this row belongs to, so playing one queues the rest. */
  list?: any[];
}>();

const player = usePlayer();
const favorites = useFavorites();
const isCurrent = computed(() => player.current.value?.id === props.shabad.id);

function toPlayable(s: any) {
  return {
    id: s.id,
    title: s.name,
    subtitle: s.artist_display ?? s.artist ?? undefined,
    artist: s.artist ?? undefined,
    shabadId: s.shabad_id ?? null,
    mainVerseId: s.main_verse_id ?? null,
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
        <NuxtLink
          v-if="shabad.artist"
          :to="`/artists/${encodeURIComponent(shabad.artist)}`"
          class="hover:text-neutral-200 hover:underline"
          @click.stop
          >{{ shabad.artist_display ?? shabad.artist }}</NuxtLink
        >
        <template v-if="shabad.raag"> {{ ' · ' }}{{ shabad.raag }} </template>
      </span>
    </span>
    <span class="flex items-center gap-3">
      <!-- Stop propagation: the row itself is the play button. -->
      <button
        class="opacity-0 transition group-hover:opacity-100"
        :class="favorites.has(shabad.id) && '!opacity-100'"
        :title="favorites.has(shabad.id) ? 'Remove from favorites' : 'Save'"
        @click.stop="favorites.toggle(shabad.id)"
      >
        <Heart
          class="size-3.5"
          :class="
            favorites.has(shabad.id)
              ? 'fill-amber-400 text-amber-400'
              : 'text-neutral-500 hover:text-neutral-200'
          "
        />
      </button>
      <span class="text-xs tabular-nums text-neutral-500">
        {{ formatTime(Number(shabad.duration_sec)) }}
      </span>
      <ShabadMenu :shabad="shabad" />
    </span>
  </button>
</template>
