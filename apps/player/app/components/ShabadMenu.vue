<script setup lang="ts">
import {
  MoreHorizontal,
  ListPlus,
  ListEnd,
  Heart,
  User,
} from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePlayer } from '~/composables/usePlayer';

const props = defineProps<{ shabad: any }>();
const player = usePlayer();
const favorites = useFavorites();

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
</script>

<template>
  <!-- Reka's dropdown brings outside-click, escape, focus return and arrow-key
       navigation, none of which the hand-rolled panel this replaces had.
       `as-child` keeps the trigger as the only element rendered, so the row
       still holds exactly one interactive node here. -->
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon-sm"
        class="size-7 rounded-full text-muted-foreground data-[state=open]:opacity-100 md:opacity-0 md:group-hover:opacity-100"
        title="More"
        @click.stop
      >
        <MoreHorizontal class="size-4" />
      </Button>
    </DropdownMenuTrigger>

    <DropdownMenuContent align="end" class="w-52" @click.stop>
      <DropdownMenuItem
        @select="player.playNextInQueue(toPlayable(props.shabad))"
      >
        <ListEnd class="size-4" /> Play next
      </DropdownMenuItem>
      <DropdownMenuItem @select="player.addToQueue(toPlayable(props.shabad))">
        <ListPlus class="size-4" /> Add to queue
      </DropdownMenuItem>
      <DropdownMenuItem @select="favorites.toggle(props.shabad.id)">
        <Heart
          class="size-4"
          :class="favorites.has(props.shabad.id) && 'fill-primary text-primary'"
        />
        {{
          favorites.has(props.shabad.id)
            ? 'Remove from favorites'
            : 'Save to favorites'
        }}
      </DropdownMenuItem>
      <DropdownMenuItem v-if="props.shabad.artist" as-child>
        <NuxtLink :to="`/ragis/${encodeURIComponent(props.shabad.artist)}`">
          <User class="size-4" /> Go to ragi
        </NuxtLink>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
