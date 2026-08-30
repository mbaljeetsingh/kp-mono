<script setup lang="ts">
/**
 * Up next, wherever it is shown.
 *
 * Two places: a tab inside the desktop full player, and a view inside the
 * phone's. Same list, so it lives here rather than in both. It used to carry a
 * `closable` flag for a third frame — the panel that slid over the transport
 * bar — which #48 removed; nothing has passed it since, so it has gone with the
 * close button it drew.
 */
import { Play, Shuffle } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { usePlayer, toPlayable } from '~/composables/usePlayer';
import { useQueueSuggestions } from '~/composables/useQueueSuggestions';

const player = usePlayer();

// What fills this panel when nobody has queued anything, which is most of the
// time. Suggestions only: tapping one plays it, and nothing starts on its own.
const suggestions = useQueueSuggestions();

/** Plays the tapped suggestion and makes the rest of its group the queue, so
 *  the group behaves like any other list in the app rather than a dead end. */
function playSuggestion(items: any[], index: number) {
  player.playList(items.map(toPlayable), index);
}
</script>

<template>
  <div>
    <div class="mb-2 flex items-center justify-between">
      <p class="text-sm font-semibold text-foreground">Up next</p>
      <!-- Grouped so the title stays hard left rather than the header spacing
           three children across. -->
      <div class="flex items-center gap-1">
        <!-- Shuffle lives here rather than beside Repeat in the transport,
             because it acts on this list and nothing else. In the bar it would
             be a control whose effect is off screen — and one that is dead most
             of the time it is visible, since the usual queue is the single
             shabad somebody tapped in a list. Two items is where it starts to
             mean something, which is when it appears. -->
        <Button
          v-if="player.upNext.value.length > 1"
          variant="ghost"
          size="xs"
          class="text-muted-foreground hover:text-foreground"
          title="Shuffle what is coming up"
          @click="player.shuffleUpNext"
        >
          <Shuffle class="size-3.5" />
          Shuffle
        </Button>
        <!-- Absent rather than dimmed when there is nothing to clear. -->
        <Button
          v-if="player.upNext.value.length"
          variant="ghost"
          size="xs"
          class="text-muted-foreground hover:text-foreground"
          @click="player.clearUpNext"
        >
          Clear
        </Button>
      </div>
    </div>

    <template v-if="!player.upNext.value.length">
      <p class="pb-3 text-xs text-muted-foreground">Nothing queued.</p>

      <!-- Grouped and headed, so it is legible as "here is what you could play
           next" rather than as a queue that filled itself. -->
      <div
        v-for="group in suggestions.groups.value"
        :key="group.label"
        class="mb-3"
      >
        <p class="px-2 pb-1 text-[11px] font-medium text-muted-foreground">
          {{ group.label }}
        </p>
        <Button
          v-for="(item, i) in group.items"
          :key="item.id"
          variant="ghost"
          class="group h-auto w-full justify-start gap-2.5 px-2 py-1.5 text-left font-normal"
          @click="playSuggestion(group.items, i)"
        >
          <span class="relative size-8 shrink-0">
            <ArtTile
              :name="item.artist ?? item.name"
              :photo="item.artist_photo"
              class="size-8 text-[9px]"
            />
            <span
              class="absolute inset-0 grid place-items-center rounded-md bg-black/55 opacity-0 transition group-hover:opacity-100"
            >
              <Play class="size-3.5 fill-current text-white" />
            </span>
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-xs text-foreground">{{
              item.name
            }}</span>
            <span class="block truncate text-[11px] text-muted-foreground">{{
              item.artist_display ?? item.artist
            }}</span>
          </span>
        </Button>
      </div>
    </template>
    <Button
      v-for="item in player.upNext.value"
      :key="item.id"
      variant="ghost"
      class="group h-auto w-full justify-start gap-2.5 px-2 py-1.5 text-left font-normal"
      @click="player.playFromQueue(item.id)"
    >
      <!-- Same affordance as a row in a list: the tile is what you click, so on
           hover it says so. -->
      <span class="relative size-8 shrink-0">
        <ArtTile
          :name="item.artist ?? item.title"
          :photo="item.artistPhoto"
          class="size-8 text-[9px]"
        />
        <span
          class="absolute inset-0 grid place-items-center rounded-md bg-black/55 opacity-0 transition group-hover:opacity-100"
        >
          <Play class="size-3.5 fill-current text-white" />
        </span>
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-xs text-foreground">{{
          item.title
        }}</span>
        <span class="block truncate text-[11px] text-muted-foreground">{{
          item.subtitle
        }}</span>
      </span>
    </Button>
  </div>
</template>
