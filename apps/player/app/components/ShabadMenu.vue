<script setup lang="ts">
import {
  MoreHorizontal,
  ListPlus,
  ListEnd,
  Heart,
  User,
} from 'lucide-vue-next';
import { usePlayer } from '~/composables/usePlayer';

const props = defineProps<{ shabad: any }>();
const player = usePlayer();
const favorites = useFavorites();
const open = ref(false);
const menu = useTemplateRef<HTMLElement>('menu');

onClickOutside(menu, () => (open.value = false));

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

function act(fn: () => void) {
  fn();
  open.value = false;
}
</script>

<template>
  <div ref="menu" class="relative">
    <button
      class="grid size-7 place-items-center rounded-full text-neutral-500 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-neutral-100"
      :class="open && '!opacity-100 text-neutral-100'"
      title="More"
      @click.stop="open = !open"
    >
      <MoreHorizontal class="size-4" />
    </button>

    <div
      v-if="open"
      class="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 py-1 shadow-2xl"
      @click.stop
    >
      <button
        class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-neutral-300 hover:bg-white/5"
        @click="act(() => player.playNextInQueue(toPlayable(props.shabad)))"
      >
        <ListEnd class="size-4" /> Play next
      </button>
      <button
        class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-neutral-300 hover:bg-white/5"
        @click="act(() => player.addToQueue(toPlayable(props.shabad)))"
      >
        <ListPlus class="size-4" /> Add to queue
      </button>
      <button
        class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-neutral-300 hover:bg-white/5"
        @click="act(() => favorites.toggle(props.shabad.id))"
      >
        <Heart
          class="size-4"
          :class="
            favorites.has(props.shabad.id) && 'fill-amber-400 text-amber-400'
          "
        />
        {{
          favorites.has(props.shabad.id)
            ? 'Remove from favorites'
            : 'Save to favorites'
        }}
      </button>
      <NuxtLink
        v-if="props.shabad.artist"
        :to="`/artists/${encodeURIComponent(props.shabad.artist)}`"
        class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-neutral-300 hover:bg-white/5"
        @click="open = false"
      >
        <User class="size-4" /> Go to artist
      </NuxtLink>
    </div>
  </div>
</template>
