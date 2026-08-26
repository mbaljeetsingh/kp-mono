<script setup lang="ts">
import { Play, Heart } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { usePlayer, formatTime, toPlayable } from '~/composables/usePlayer';

const props = defineProps<{
  shabad: any;
  index?: number;
  /** The full list this row belongs to, so playing one queues the rest. */
  list?: any[];
  /** Set while reading a playlist: the row menu then offers to remove the
   *  shabad from *this* playlist instead of only adding it to others. */
  playlistId?: string;
}>();

/** Fired once the shabad has left the playlist, so the page can drop the row
 *  without re-reading the whole list. */
const emit = defineEmits<{ removed: [] }>();

const player = usePlayer();
const favorites = useFavorites();
const isCurrent = computed(() => player.current.value?.id === props.shabad.id);

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
    class="group grid w-full cursor-pointer grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-md px-3 py-2 text-left transition hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    :class="isCurrent && 'bg-foreground/5'"
    @click="play"
    @keydown.enter.prevent="play"
    @keydown.space.prevent="play"
  >
    <span
      class="grid place-items-center text-xs tabular-nums text-muted-foreground"
    >
      <Play
        v-if="isCurrent && player.playing.value"
        class="size-3.5 fill-current text-primary"
      />
      <span v-else class="grid place-items-center">
        <span class="group-hover:hidden">{{
          index != null ? index + 1 : ''
        }}</span>
        <Play
          class="hidden size-3.5 fill-current text-foreground group-hover:block"
        />
      </span>
    </span>
    <span class="min-w-0">
      <span
        class="block truncate text-sm"
        :class="isCurrent ? 'text-primary' : 'text-foreground'"
      >
        {{ shabad.name }}
      </span>
      <span class="block truncate text-xs text-muted-foreground">
        <NuxtLink
          v-if="shabad.artist"
          :to="`/ragis/${encodeURIComponent(shabad.artist)}`"
          class="hover:text-foreground hover:underline"
          @click.stop
          >{{ shabad.artist_display ?? shabad.artist }}</NuxtLink
        >
        <template v-if="shabad.raag"> {{ ' · ' }}{{ shabad.raag }} </template>
      </span>
    </span>
    <span class="flex items-center gap-3">
      <!-- Always visible on touch, where there is no hover to reveal them. -->
      <Button
        variant="ghost"
        size="icon-sm"
        class="size-7 md:opacity-0 md:group-hover:opacity-100"
        :class="favorites.has(shabad.id) && 'md:!opacity-100'"
        :title="favorites.has(shabad.id) ? 'Remove from favorites' : 'Save'"
        @click.stop="favorites.toggle(shabad.id)"
      >
        <Heart
          class="size-3.5"
          :class="
            favorites.has(shabad.id)
              ? 'fill-primary text-primary'
              : 'text-muted-foreground'
          "
        />
      </Button>
      <span class="text-xs tabular-nums text-muted-foreground">
        {{ formatTime(Number(shabad.duration_sec)) }}
      </span>
      <ShabadMenu
        :shabad="shabad"
        :playlist-id="playlistId"
        @removed="emit('removed')"
      />
    </span>
  </div>
</template>
