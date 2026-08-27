<script setup lang="ts">
import { Repeat1, Radio, ChevronUp, ChevronDown } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { usePlayer, formatTime } from '~/composables/usePlayer';
import { useNowPlayingView } from '~/composables/useNowPlayingView';
import { artworkFor } from '~/composables/useArtwork';

const player = usePlayer();
const nowPlayingView = useNowPlayingView();
// The full player — see NowPlayingSheet. Both sizes open it now: a phone by
// tapping the bar, a desktop from the chevron at the far right.
const showSheet = ref(false);

// In rem, because that is the unit `md:` resolves against (48rem). Pinning it
// to 767px instead would let the phone layout render while this stayed false
// for anyone whose root font is not 16px.
const isPhone = useMediaQuery('(max-width: 47.999rem)');

// Each player belongs to one side of the breakpoint, and its only way out is a
// control that lives on that side. Crossing it while one is open would leave
// the sheet stranded on a desktop, or the desktop view invisible-but-open on a
// phone — and open over whatever was navigated to by the time it came back.
watch(isPhone, (phone) => {
  if (phone) nowPlayingView.open.value = false;
  else showSheet.value = false;
});

/**
 * Whether there is a player to open — and so whether the bar should announce
 * itself as a control at all.
 *
 * A queue counts, not only a loaded track. `addToQueue` deliberately starts
 * nothing, so "add to queue" with an idle transport leaves shabads queued and
 * no `current`, and the queue lives inside the player.
 */
const hasPlayer = computed(
  () => !!player.current.value || player.upNext.value.length > 0
);

/** Tapping the title area, which is the phone's way in. A desktop click near
 *  the scrubber should not take the whole window, so there it does nothing —
 *  the chevron is the deliberate act. */
const canExpand = computed(() => isPhone.value && hasPlayer.value);

function expand() {
  if (canExpand.value) showSheet.value = true;
}

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

    <footer
      class="relative border-t border-border bg-background px-4 py-2.5 md:py-3"
    >
      <!-- Desktop reads left to right the way a deck does: what moves
           playback, then where you are in it, then what is playing. A phone
           has no room for that order — the title has to lead — so the columns
           are reordered rather than duplicated. -->
      <!-- Three columns on a desktop, not a row: `1fr auto 1fr` is what puts
           the metadata dead centre of the window rather than merely after the
           controls, however wide the groups either side of it happen to be.
           A phone has no room for three of anything, so it stays a flex row
           with the title leading. -->
      <div
        class="mx-auto flex max-w-7xl items-center gap-3 md:grid md:grid-cols-[1fr_auto_1fr] md:gap-4"
      >
        <div
          class="order-2 flex flex-none items-center gap-2 md:order-none md:gap-3 md:justify-self-start"
        >
          <PlayerControls compact />

          <!-- The clock sits beside the controls now that the line it used to
               belong to spans the top of the bar. One label rather than two:
               with nothing between them they read as a pair. A broadcast has
               no position to report, so it says how long it has been on. -->
          <div
            class="ml-1 hidden shrink-0 items-center gap-2 text-[11px] tabular-nums text-muted-foreground md:flex"
          >
            <template v-if="player.isLive.value">
              <LiveBadge :pulse="player.playing.value" />
              <span>{{ liveStatus }}</span>
            </template>
            <span v-else>
              {{ formatTime(player.elapsed.value) }} /
              {{ formatTime(player.total.value) }}
            </span>
          </div>
        </div>

        <!-- Not a <button>, though the whole area is tappable on a phone: it
             contains the artist link, and a button may not nest one — the
             parser reparents it and hydration then walks a DOM that does not
             match the vdom. Same reasoning as ShabadRow. -->
        <div
          class="order-1 flex min-w-0 flex-1 items-center gap-3 md:order-none md:w-full md:max-w-sm md:flex-none md:cursor-default md:justify-self-center"
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
            class="grid size-11 shrink-0 place-items-center rounded bg-primary/10 md:size-10"
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
            class="size-11 shrink-0 text-[11px] md:size-10"
          />
          <div
            v-else
            class="grid size-11 shrink-0 place-items-center rounded text-[11px] font-semibold text-white/80 md:size-10"
            :style="art.style"
          >
            ♪
          </div>
          <div class="min-w-0">
            <p class="truncate text-sm text-foreground">
              {{ player.current.value?.title ?? 'Nothing playing' }}
            </p>
            <p class="flex items-center gap-1.5 text-xs text-muted-foreground">
              <!-- On a phone this is where the broadcast is marked: the clock
                   beside the controls is desktop-only, and the line this would
                   have sat in is three pixels tall. -->
              <LiveBadge
                v-if="player.isLive.value"
                :pulse="player.playing.value"
                class="shrink-0 md:hidden"
              />
              <!-- Inert to a thumb, like a list row's: this line sits inside
                   the area that opens the full player, and a link inside a tap
                   target is a coin toss. The player itself carries the ragi —
                   which is why this one is also gated on the phone layout,
                   unlike a row's. Above `md` the bar does not expand on a
                   click, so the link is the only thing here that acts. -->
              <NuxtLink
                v-if="player.current.value?.artist"
                :to="`/ragis/${encodeURIComponent(player.current.value.artist)}`"
                class="truncate max-md:pointer-coarse:pointer-events-none hover:text-foreground hover:underline"
                @click.stop
                >{{ player.current.value.subtitle }}</NuxtLink
              >
              <span v-else class="truncate">{{
                player.current.value?.subtitle ?? 'Pick a shabad to start'
              }}</span>
            </p>
          </div>
        </div>

        <!-- Far right, the way every deck ends: the setting that outlives this
             shabad, then the way into the full player.
             Never disabled while that player is open, or clearing the queue
             from inside it would leave no way back out. -->
        <div
          class="order-3 hidden flex-none items-center gap-1 md:flex md:justify-self-end"
        >
          <Button
            v-if="!player.isLive.value"
            variant="ghost"
            size="icon-sm"
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
          <Button
            variant="ghost"
            size="icon-sm"
            class="text-muted-foreground"
            :class="nowPlayingView.open.value && '!text-primary'"
            :disabled="!hasPlayer && !nowPlayingView.open.value"
            :aria-expanded="nowPlayingView.open.value"
            :aria-label="
              nowPlayingView.open.value
                ? 'Close the full player'
                : 'Open the full player'
            "
            :title="
              nowPlayingView.open.value
                ? 'Close the full player'
                : 'Open the full player'
            "
            @click="nowPlayingView.open.value = !nowPlayingView.open.value"
          >
            <ChevronDown v-if="nowPlayingView.open.value" class="size-4" />
            <ChevronUp v-else class="size-4" />
          </Button>
        </div>
      </div>

      <!-- The timeline rides the top edge of the bar, full-bleed, above
           everything it controls — where every desktop player puts it.
           Absolutely positioned so it costs no height, and sitting in the
           bar's own top padding so its band swallows no clicks meant for the
           row beneath.
           A phone gets the same line painted rather than draggable: three
           pixels is not a target, and the whole bar already opens the
           full-screen player, where the timeline is 342px wide and 32 tall.
           A broadcast has no progress to draw and is marked in the subtitle
           instead. -->
      <template v-if="!player.isLive.value">
        <SeekBar
          edge
          class="absolute inset-x-0 top-0 hidden md:block"
          :progress="player.progress.value"
          :elapsed="player.elapsed.value"
          :total="player.total.value"
          :disabled="!player.current.value"
          @seek="player.seekPct"
        />
        <div
          class="absolute inset-x-0 top-0 h-[3px] overflow-hidden bg-foreground/10 md:hidden"
        >
          <div
            class="h-full bg-primary transition-[width] duration-300 ease-linear"
            :style="{ width: `${player.progress.value}%` }"
          />
        </div>
      </template>
    </footer>
  </div>
</template>
