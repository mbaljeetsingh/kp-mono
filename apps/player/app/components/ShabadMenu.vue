<script setup lang="ts">
import {
  MoreHorizontal,
  ListPlus,
  ListEnd,
  ListMusic,
  ListX,
  Heart,
  Plus,
  User,
} from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toPlayable, usePlayer } from '~/composables/usePlayer';

const props = defineProps<{
  shabad: any;
  /** Set while reading a playlist — see ShabadRow. */
  playlistId?: string;
}>();

const emit = defineEmits<{ removed: [] }>();

const player = usePlayer();
const favorites = useFavorites();
const auth = useAuth();
const playlists = usePlaylists();

function addToPlaylist(playlistId: string) {
  void playlists.addItem(playlistId, props.shabad.id);
}

async function removeFromPlaylist() {
  if (!props.playlistId) return;
  const error = await playlists.removeItem(props.playlistId, props.shabad.id);
  // Only tell the page the row is gone once the delete actually landed —
  // dropping it optimistically would hide a row that is still in the playlist.
  if (!error) emit('removed');
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

      <DropdownMenuSeparator />

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

      <DropdownMenuItem
        v-if="props.playlistId"
        class="text-destructive"
        @select="removeFromPlaylist"
      >
        <ListX class="size-4" /> Remove from this playlist
      </DropdownMenuItem>

      <!-- Signed out there is nothing to list, so this is a plain item that
           asks for an account rather than a submenu that opens onto nothing. -->
      <DropdownMenuItem
        v-if="!auth.user.value"
        @select="
          playlists.promptNew({ id: props.shabad.id, name: props.shabad.name })
        "
      >
        <ListMusic class="size-4" /> Add to playlist
      </DropdownMenuItem>
      <DropdownMenuSub v-else>
        <DropdownMenuSubTrigger>
          <ListMusic class="size-4" /> Add to playlist
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent class="max-h-72 w-56 overflow-y-auto">
          <DropdownMenuItem
            v-for="playlist in playlists.playlists.value"
            :key="playlist.id"
            @select="addToPlaylist(playlist.id)"
          >
            <span class="truncate">{{ playlist.name }}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator v-if="playlists.playlists.value.length" />
          <DropdownMenuItem
            @select="
              playlists.promptNew({
                id: props.shabad.id,
                name: props.shabad.name,
              })
            "
          >
            <Plus class="size-4" /> New playlist…
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuItem v-if="props.shabad.artist" as-child>
        <NuxtLink :to="`/ragis/${encodeURIComponent(props.shabad.artist)}`">
          <User class="size-4" /> Go to ragi
        </NuxtLink>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
