<script setup lang="ts">
/**
 * Up next, wherever it is shown.
 *
 * Two places now: the panel that slides over the desktop bar, and a view inside
 * the full-screen player on a phone. Same list, so it lives here rather than in
 * both — only the frame around it differs, which is what `onClose` decides.
 */
import { X, Play } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { usePlayer, toPlayable } from '~/composables/usePlayer';
import { useQueueSuggestions } from '~/composables/useQueueSuggestions';

/** Close affordance, for the frame that needs one. The full-screen view
 *  switches back with the same toggle that opened it, so it passes nothing. */
const props = defineProps<{ closable?: boolean }>();
const emit = defineEmits<{ close: [] }>();

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
        <Button
          v-if="props.closable"
          variant="ghost"
          size="icon-sm"
          class="size-7 text-muted-foreground"
          aria-label="Close up next"
          @click="emit('close')"
        >
          <X class="size-4" />
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
