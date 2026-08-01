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
    artistPhoto: s.artist_photo ?? null,
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
  <!-- Deliberately not a <button>, though the whole row is clickable: it
       contains the favourite and menu buttons, and a button may not nest a
       button. The HTML parser silently closes the outer one and reparents the
       inner buttons as siblings, so the DOM the browser builds is not the DOM
       the server described — Vue then hydrates a nested vdom against a flat
       DOM, the node cursor slips, and a later row renders wearing another
       element's attributes instead of its own. -->
  <div
    role="button"
    tabindex="0"
    class="group grid w-full cursor-pointer grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-md px-3 py-2 text-left transition hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-neutral-500 focus-visible:outline-none"
    :class="isCurrent && 'bg-white/5'"
    @click="play"
    @keydown.enter.prevent="play"
    @keydown.space.prevent="play"
  >
    <span class="grid place-items-center text-xs tabular-nums text-neutral-500">
      <Play
        v-if="isCurrent && player.playing.value"
        class="size-3.5 fill-current text-amber-400"
      />
      <span v-else class="grid place-items-center">
        <span class="group-hover:hidden">{{
          index != null ? index + 1 : ''
        }}</span>
        <Play
          class="hidden size-3.5 fill-current text-neutral-100 group-hover:block"
        />
      </span>
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
          :to="`/ragis/${encodeURIComponent(shabad.artist)}`"
          class="hover:text-neutral-200 hover:underline"
          @click.stop
          >{{ shabad.artist_display ?? shabad.artist }}</NuxtLink
        >
        <template v-if="shabad.raag"> {{ ' · ' }}{{ shabad.raag }} </template>
      </span>
    </span>
    <span class="flex items-center gap-3">
      <!-- Always visible on touch, where there is no hover to reveal them. -->
      <button
        class="transition md:opacity-0 md:group-hover:opacity-100"
        :class="favorites.has(shabad.id) && 'md:!opacity-100'"
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
  </div>
</template>
