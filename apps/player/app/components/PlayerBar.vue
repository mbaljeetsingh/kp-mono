<script setup lang="ts">
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ListMusic,
  BookOpen,
  Radio,
  X,
} from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { usePlayer, formatTime } from '~/composables/usePlayer';
import { artworkFor } from '~/composables/useArtwork';

const player = usePlayer();
const showQueue = ref(false);
const showLyrics = ref(false);

// Read-along belongs on the transport, not on a page: you are listening when
// you want it, and it should follow whatever is playing.
const hasShabad = computed(() => player.current.value?.shabadId != null);

const art = computed(() =>
  artworkFor(
    player.current.value?.subtitle ?? player.current.value?.title ?? 'kirtan'
  )
);

function scrub(event: Event) {
  const pct = Number((event.target as HTMLInputElement).value);
  const start = player.current.value?.startSec ?? 0;
  const end = player.current.value?.endSec ?? player.duration.value;
  player.seek(start + ((end - start) * pct) / 100);
}

// Elapsed within the shabad, not within the file it sits inside — a segment
// starting at 42:10 of a set should read 0:00, not 42:10.
const elapsed = computed(() =>
  Math.max(0, player.currentTime.value - (player.current.value?.startSec ?? 0))
);
const total = computed(() => {
  const c = player.current.value;
  if (c?.endSec != null && c.startSec != null) return c.endSec - c.startSec;
  return player.duration.value;
});

// For the broadcast the clock measures time spent listening, not a position in
// anything — so it is labelled, and reads as stopped rather than as 0:00 when
// the listener is not connected.
const liveStatus = computed(() =>
  player.playing.value ? `Listening ${formatTime(elapsed.value)}` : 'Stopped'
);
</script>

<template>
  <div class="relative">
    <LyricsPanel v-model:open="showLyrics" />

    <!-- Up next slides over the content rather than pushing it, so the queue
         can be checked without losing your place in a list. -->
    <Transition
      enter-active-class="transition duration-200"
      leave-active-class="transition duration-150"
      enter-from-class="translate-y-4 opacity-0"
      leave-to-class="translate-y-4 opacity-0"
    >
      <aside
        v-if="showQueue"
        class="absolute right-4 bottom-full mb-2 max-h-96 w-80 overflow-y-auto rounded-lg border border-border bg-card p-3 shadow-2xl"
      >
        <div class="mb-2 flex items-center justify-between">
          <p class="text-sm font-semibold text-foreground">Up next</p>
          <!-- Grouped so the title stays hard left rather than the header
               spacing three children across. -->
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
              variant="ghost"
              size="icon-sm"
              class="size-7 text-muted-foreground"
              @click="showQueue = false"
            >
              <X class="size-4" />
            </Button>
          </div>
        </div>
        <p
          v-if="!player.upNext.value.length"
          class="py-6 text-center text-xs text-muted-foreground"
        >
          Nothing queued.
        </p>
        <Button
          v-for="item in player.upNext.value"
          :key="item.id"
          variant="ghost"
          class="group h-auto w-full justify-start gap-2.5 px-2 py-1.5 font-normal"
          @click="player.playFromQueue(item.id)"
        >
          <!-- Same affordance as a row in a list: the tile is what you click,
               so on hover it says so. -->
          <span class="relative size-8 shrink-0">
            <ArtTile
              :name="item.artist ?? item.title"
              :photo="item.artistPhoto"
              class="size-8 text-[9px]"
            />
            <span
              class="absolute inset-0 grid place-items-center rounded-md bg-black/55 opacity-0 transition group-hover:opacity-100"
            >
              <Play class="size-3.5 fill-current text-foreground" />
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
      </aside>
    </Transition>

    <footer class="border-t border-border bg-background px-4 py-2.5 md:py-3">
      <div class="mx-auto flex max-w-7xl items-center gap-3 md:gap-4">
        <div class="flex min-w-0 flex-1 items-center gap-3">
          <!-- The broadcast has no artist to draw a tile for, and initials of
               its title would be meaningless — it gets the same mark the Live
               controls use. -->
          <div
            v-if="player.isLive.value"
            class="grid size-11 shrink-0 place-items-center rounded bg-primary/10 md:size-12"
          >
            <Radio
              class="size-5 text-primary"
              :class="player.playing.value && 'animate-pulse'"
            />
          </div>
          <ArtTile
            v-else-if="player.current.value"
            :name="player.current.value.artist ?? player.current.value.title"
            :photo="player.current.value.artistPhoto"
            class="size-11 shrink-0 text-[11px] md:size-12"
          />
          <div
            v-else
            class="grid size-11 shrink-0 place-items-center rounded text-[11px] font-semibold text-white/80 md:size-12"
            :style="art.style"
          >
            ♪
          </div>
          <div class="min-w-0">
            <p class="truncate text-sm text-foreground">
              {{ player.current.value?.title ?? 'Nothing playing' }}
            </p>
            <p class="truncate text-xs text-muted-foreground">
              <NuxtLink
                v-if="player.current.value?.artist"
                :to="`/ragis/${encodeURIComponent(player.current.value.artist)}`"
                class="hover:text-foreground hover:underline"
                >{{ player.current.value.subtitle }}</NuxtLink
              >
              <template v-else>{{
                player.current.value?.subtitle ?? 'Pick a shabad to start'
              }}</template>
            </p>
          </div>
        </div>

        <!-- The 1:2:1 split is for the desktop bar, where the middle column
             carries the scrubber. On a phone it left the title 28px and an
             ellipsis while a lone play button sat in 167px of space, so there
             the transport and the trailing controls size to their content and
             the title takes the rest. -->
        <div class="flex flex-none flex-col items-center gap-1.5 md:flex-[2]">
          <div class="flex items-center gap-4">
            <!-- Skip controls step through a queue position the broadcast does
                 not have: there is nothing before now, and nothing after it. -->
            <Button
              v-if="!player.isLive.value"
              variant="ghost"
              size="icon-sm"
              class="text-muted-foreground"
              :disabled="!player.current.value"
              aria-label="Previous shabad"
              title="Previous (shift+← or P)"
              @click="player.previous"
            >
              <SkipBack class="size-4 fill-current" />
            </Button>
            <Button
              size="icon"
              class="size-9 rounded-full transition hover:scale-105"
              :disabled="!player.current.value"
              :aria-label="player.playing.value ? 'Pause' : 'Play'"
              :title="player.playing.value ? 'Pause (space)' : 'Play (space)'"
              @click="player.toggle"
            >
              <Pause v-if="player.playing.value" class="size-4 fill-current" />
              <Play v-else class="size-4 translate-x-px fill-current" />
            </Button>
            <Button
              v-if="!player.isLive.value"
              variant="ghost"
              size="icon-sm"
              class="text-muted-foreground"
              :disabled="!player.upNext.value.length"
              aria-label="Next shabad"
              title="Next (shift+→ or N)"
              @click="player.next"
            >
              <SkipForward class="size-4 fill-current" />
            </Button>
          </div>

          <!-- No timeline to offer: duration is Infinity and the connection is
               not seekable, so the scrubber gives way to how long you have been
               listening. Up next stays reachable — the queue survives a detour
               through the broadcast. -->
          <div
            v-if="player.isLive.value"
            class="hidden w-full items-center justify-center gap-2 md:flex"
          >
            <LiveBadge :pulse="player.playing.value" />
            <span class="text-[11px] tabular-nums text-muted-foreground">
              {{ liveStatus }}
            </span>
          </div>
          <div v-else class="hidden w-full items-center gap-2 md:flex">
            <span
              class="w-10 text-right text-[11px] tabular-nums text-muted-foreground"
            >
              {{ formatTime(elapsed) }}
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              :value="player.progress.value"
              :disabled="!player.current.value"
              class="h-1 flex-1 accent-primary"
              aria-label="Seek within this shabad"
              :aria-valuetext="`${formatTime(elapsed)} of ${formatTime(total)}`"
              @input="scrub"
            />
            <span class="w-10 text-[11px] tabular-nums text-muted-foreground">
              {{ formatTime(total) }}
            </span>
          </div>
        </div>

        <div class="flex flex-none items-center justify-end gap-3 md:flex-1">
          <!-- Only rendered when the segment carries a BaniDB shabad id. Most
               will not for a long time, and a permanently dimmed control the
               listener cannot act on is noise rather than information. -->
          <Button
            v-if="hasShabad"
            variant="ghost"
            size="icon-sm"
            class="text-muted-foreground"
            :class="showLyrics && '!text-primary'"
            aria-label="Read along"
            title="Read along"
            @click="((showLyrics = !showLyrics), (showQueue = false))"
          >
            <BookOpen class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            class="hidden text-muted-foreground md:inline-flex"
            :class="showQueue && '!text-primary'"
            aria-label="Up next"
            title="Up next"
            @click="((showQueue = !showQueue), (showLyrics = false))"
          >
            <ListMusic class="size-4" />
          </Button>
        </div>
      </div>

      <!-- Mobile keeps a hairline progress bar instead of the full scrubber.
           A broadcast has no progress to draw, so the badge takes that slot
           rather than the transport row, which on a phone is too narrow to
           hold it without crushing the title to an ellipsis. -->
      <div
        v-if="player.isLive.value"
        class="mt-2 flex items-center justify-center gap-2 md:hidden"
      >
        <LiveBadge :pulse="player.playing.value" />
        <span class="text-[11px] tabular-nums text-muted-foreground">
          {{ liveStatus }}
        </span>
      </div>
      <div v-else class="mt-2 h-0.5 w-full rounded bg-muted md:hidden">
        <div
          class="h-full rounded bg-primary"
          :style="{ width: `${player.progress.value}%` }"
        />
      </div>
    </footer>
  </div>
</template>
