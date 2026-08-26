<script setup lang="ts">
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat1,
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

function scrub(pct: number) {
  const start = player.current.value?.startSec ?? 0;
  const end = player.current.value?.endSec ?? player.duration.value;
  const to = start + ((end - start) * pct) / 100;
  // Landing exactly on the end trips the advance-to-next check in
  // onTimeUpdate, so dragging to the far right of the bar would skip the
  // shabad rather than park at the end of it. Stop just short, the way the
  // arrow-key nudges do.
  player.seek(
    Number.isFinite(end) && end > start ? Math.min(to, end - 0.5) : to
  );
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
        class="absolute right-4 bottom-full left-4 mb-2 max-h-[min(24rem,55svh)] overflow-y-auto rounded-lg border border-border bg-card p-3 shadow-2xl sm:left-auto sm:w-80"
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
          class="group h-auto w-full justify-start gap-2.5 px-2 py-1.5 text-left font-normal"
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
             the transport sizes to its content and the title takes the rest —
             everything else has moved to the row below. -->
        <div class="flex flex-none flex-col items-center gap-1.5 md:flex-[2]">
          <!-- Tighter on a phone, where gap-4 between these spent 32px on air
               that the title needs. -->
          <div class="flex items-center gap-2 md:gap-4">
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
            <!-- Repeat-one. Hidden during live, which has no end to repeat.
                 Stays enabled with an empty queue, unlike Next: repeating the
                 one shabad you are sitting with is exactly the case where
                 nothing follows it. On a phone it rides the scrubber row
                 instead — see below. -->
            <Button
              v-if="!player.isLive.value"
              variant="ghost"
              size="icon-sm"
              class="hidden md:inline-flex"
              :class="
                player.repeat.value ? 'text-primary' : 'text-muted-foreground'
              "
              :disabled="!player.current.value"
              :aria-pressed="player.repeat.value"
              :aria-label="
                player.repeat.value ? 'Turn off repeat' : 'Repeat this shabad'
              "
              :title="
                player.repeat.value
                  ? 'Repeat is on — this shabad replays (R)'
                  : 'Repeat this shabad (R)'
              "
              @click="player.toggleRepeat"
            >
              <Repeat1 class="size-4" />
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
          <SeekBar
            v-else
            class="hidden w-full md:flex"
            :progress="player.progress.value"
            :elapsed="elapsed"
            :total="total"
            :disabled="!player.current.value"
            @seek="scrub"
          />
        </div>

        <!-- Desktop only. On a phone these two ride the second row with the
             scrubber: at 320px the bar was spending 76px on them and leaving
             the title 16 — an ellipsis and nothing else. -->
        <div
          class="hidden flex-none items-center justify-end gap-3 md:flex md:flex-1"
        >
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
          <!-- On a phone as well as on desktop: rows queue shabads from
               every list, and this was the only way to read that queue or
               clear it. -->
          <Button
            variant="ghost"
            size="icon-sm"
            class="text-muted-foreground"
            :class="showQueue && '!text-primary'"
            aria-label="Up next"
            title="Up next"
            @click="((showQueue = !showQueue), (showLyrics = false))"
          >
            <ListMusic class="size-4" />
          </Button>
        </div>
      </div>

      <!-- The phone's second row. The transport above only has room for the
           title and the three controls that move playback, so the timeline —
           or the live clock, which replaces it, having nothing to scrub — and
           every secondary toggle live down here. Read-along and Up next are
           reachable during a broadcast too: the queue survives a detour
           through it. -->
      <div class="mt-1 flex items-center gap-1 md:hidden">
        <div
          v-if="player.isLive.value"
          class="flex min-w-0 flex-1 items-center justify-center gap-2"
        >
          <LiveBadge :pulse="player.playing.value" />
          <span class="text-[11px] tabular-nums text-muted-foreground">
            {{ liveStatus }}
          </span>
        </div>
        <SeekBar
          v-else
          class="min-w-0 flex-1"
          :progress="player.progress.value"
          :elapsed="elapsed"
          :total="total"
          :disabled="!player.current.value"
          @seek="scrub"
        />
        <Button
          v-if="!player.isLive.value"
          variant="ghost"
          size="icon-sm"
          class="size-7 shrink-0"
          :class="
            player.repeat.value ? 'text-primary' : 'text-muted-foreground'
          "
          :disabled="!player.current.value"
          :aria-pressed="player.repeat.value"
          :aria-label="
            player.repeat.value ? 'Turn off repeat' : 'Repeat this shabad'
          "
          @click="player.toggleRepeat"
        >
          <Repeat1 class="size-4" />
        </Button>
        <Button
          v-if="hasShabad"
          variant="ghost"
          size="icon-sm"
          class="size-7 shrink-0 text-muted-foreground"
          :class="showLyrics && '!text-primary'"
          aria-label="Read along"
          @click="((showLyrics = !showLyrics), (showQueue = false))"
        >
          <BookOpen class="size-4" />
        </Button>
        <!-- Rows queue shabads from every list, and before this a phone had no
             way to read that queue or clear it. -->
        <Button
          variant="ghost"
          size="icon-sm"
          class="size-7 shrink-0 text-muted-foreground"
          :class="showQueue && '!text-primary'"
          aria-label="Up next"
          @click="((showQueue = !showQueue), (showLyrics = false))"
        >
          <ListMusic class="size-4" />
        </Button>
      </div>
    </footer>
  </div>
</template>
