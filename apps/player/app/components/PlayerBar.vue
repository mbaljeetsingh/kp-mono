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
} from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { usePlayer, formatTime } from '~/composables/usePlayer';
import { artworkFor } from '~/composables/useArtwork';

const player = usePlayer();
const showQueue = ref(false);
const showLyrics = ref(false);
// The full-screen player, which only exists on a phone — see NowPlayingSheet.
const showSheet = ref(false);

// Tapping the title area opens that sheet, the way every phone music player
// does. Only there: on desktop the bar already carries the whole transport,
// and a target that does something at one width and nothing at another should
// not advertise itself at both.
// In rem, because that is the unit `md:` resolves against (48rem). Pinning it
// to 767px instead would let the phone layout render while this stayed false —
// leaving the full-screen player unreachable — for anyone whose root font is
// not 16px.
const isPhone = useMediaQuery('(max-width: 47.999rem)');
watch(isPhone, (phone) => {
  if (!phone) showSheet.value = false;
});

/**
 * Whether tapping the title area does anything — and so whether it should
 * announce itself as a control at all.
 *
 * A queue counts, not only a loaded track. `addToQueue` deliberately starts
 * nothing, so "add to queue" with an idle transport leaves shabads queued and
 * no `current` — and since the queue is now only reachable through the player
 * screen on a phone, gating this on `current` alone stranded them there.
 */
const canExpand = computed(
  () =>
    isPhone.value && (!!player.current.value || player.upNext.value.length > 0)
);

function expand() {
  if (canExpand.value) showSheet.value = true;
}

// Read-along belongs on the transport, not on a page: you are listening when
// you want it, and it should follow whatever is playing.
const hasShabad = computed(() => player.current.value?.shabadId != null);

const art = computed(() =>
  artworkFor(
    player.current.value?.subtitle ?? player.current.value?.title ?? 'kirtan'
  )
);

// For the broadcast the clock measures time spent listening, not a position in
// anything — so it is labelled, and reads as stopped rather than as 0:00 when
// the listener is not connected.
const liveStatus = computed(() =>
  player.playing.value
    ? `Listening ${formatTime(player.elapsed.value)}`
    : 'Stopped'
);
</script>

<template>
  <div class="relative">
    <NowPlayingSheet v-model:open="showSheet" />

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
        <QueueList closable @close="showQueue = false" />
      </aside>
    </Transition>

    <footer
      class="relative border-t border-border bg-background px-4 py-2.5 md:py-3"
    >
      <div class="mx-auto flex max-w-7xl items-center gap-3 md:gap-4">
        <!-- Not a <button>, though the whole area is tappable on a phone: it
             contains the artist link, and a button may not nest one — the
             parser reparents it and hydration then walks a DOM that does not
             match the vdom. Same reasoning as ShabadRow. -->
        <div
          class="flex min-w-0 flex-1 items-center gap-3 md:cursor-default"
          :class="canExpand && 'cursor-pointer'"
          :role="canExpand ? 'button' : undefined"
          :tabindex="canExpand ? 0 : undefined"
          :aria-label="canExpand ? 'Open the full player' : undefined"
          @click="expand"
          @keydown.enter.self.prevent="expand"
          @keydown.space.self.prevent.stop="expand"
        >
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
            <p class="flex items-center gap-1.5 text-xs text-muted-foreground">
              <!-- On a phone this is where the broadcast is marked: there is no
                   scrubber row left to carry the badge, and the line it would
                   have sat in is now three pixels tall. -->
              <LiveBadge
                v-if="player.isLive.value"
                :pulse="player.playing.value"
                class="shrink-0 md:hidden"
              />
              <!-- Inert to a thumb, like a list row's: this line sits inside
                   the area that opens the full player, and a link inside a tap
                   target is a coin toss. The player itself carries the ragi. -->
              <NuxtLink
                v-if="player.current.value?.artist"
                :to="`/ragis/${encodeURIComponent(player.current.value.artist)}`"
                class="truncate pointer-coarse:pointer-events-none hover:text-foreground hover:underline"
                @click.stop
                >{{ player.current.value.subtitle }}</NuxtLink
              >
              <span v-else class="truncate">{{
                player.current.value?.subtitle ?? 'Pick a shabad to start'
              }}</span>
            </p>
          </div>
        </div>

        <!-- The 1:2:1 split is for the desktop bar, where the middle column
             carries the scrubber. A phone gives the title everything the two
             controls it keeps do not need: play, and next. -->
        <div class="flex flex-none flex-col items-center gap-1.5 md:flex-[2]">
          <div class="flex items-center gap-2 md:gap-4">
            <!-- Skip controls step through a queue position the broadcast does
                 not have: there is nothing before now, and nothing after it.
                 Previous is desktop-only — on a phone it is one of the controls
                 the full-screen player carries, where there is room for it. -->
            <Button
              v-if="!player.isLive.value"
              variant="ghost"
              size="icon-sm"
              class="hidden text-muted-foreground md:inline-flex"
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
                 nothing follows it. Desktop-only, like Previous. -->
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
            :elapsed="player.elapsed.value"
            :total="player.total.value"
            :disabled="!player.current.value"
            @seek="player.seekPct"
          />
        </div>

        <!-- Desktop only. On a phone these two are views inside the
             full-screen player: at 320px the bar was spending 76px on them and
             leaving the title 16 — an ellipsis and nothing else. -->
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

      <!-- What is left of the scrubber on a phone: a line, flush with the
           bottom edge and full-bleed, the way every phone music player draws
           it. Absolutely positioned so it adds no height, and deliberately not
           interactive — three pixels is not a target, and the whole bar above
           it already opens the full-screen player, where the timeline is
           342px wide and 32 tall. A broadcast has no progress to draw, and is
           marked in the subtitle instead. -->
      <div
        v-if="!player.isLive.value"
        class="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden bg-foreground/10 md:hidden"
      >
        <div
          class="h-full bg-primary transition-[width] duration-300 ease-linear"
          :style="{ width: `${player.progress.value}%` }"
        />
      </div>
    </footer>
  </div>
</template>
