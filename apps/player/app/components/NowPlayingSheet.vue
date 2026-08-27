<script setup lang="ts">
/**
 * The full-screen player, opened by tapping the mini transport on a phone.
 *
 * This is the phone's player; the bar is a summary of it. That split is what
 * every phone music player settles on, and the arithmetic says why: a 390px bar
 * that also carries a scrubber, its clock, four transport controls and three
 * toggles leaves the title 98px, and at 320px it left it 16. So the bar keeps
 * what you glance at — who is playing, and play/next — and everything you have
 * to aim at lives here, at a size a thumb can hit: a full-width timeline, the
 * skip and repeat controls, the read-along, and the queue.
 *
 * The read-along and the queue are views in this screen rather than panels over
 * the bar, for the same reason. A panel that opens behind a full-screen sheet is
 * invisible, and collapsing the sheet to show it throws away the context the
 * listener just opened.
 *
 * Hand-rolled rather than the Drawer in layers/ui: vaul reads pointer moves on
 * its content to drag the sheet down, and the scrubber's own drag — which
 * captures the pointer and so keeps bubbling to its ancestors — would be read
 * as a dismiss. The dismiss gesture is confined to the handle at the top
 * instead, where nothing else wants the pointer.
 */
import {
  ChevronDown,
  ChevronRight,
  Repeat1,
  ListMusic,
  BookOpen,
  Radio,
} from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { usePlayer, formatTime } from '~/composables/usePlayer';

const player = usePlayer();
const open = defineModel<boolean>('open', { default: false });

const hasShabad = computed(() => player.current.value?.shabadId != null);

/**
 * What fills the space above the controls. Artwork is the resting state and
 * both toggles come back to it, so the button that opened a view closes it.
 */
type View = 'art' | 'lyrics' | 'queue';
const view = ref<View>('art');

function show(next: View) {
  view.value = view.value === next ? 'art' : next;
}

const TABS: { value: Exclude<View, 'art'>; label: string; icon: any }[] = [
  { value: 'queue', label: 'Up next', icon: ListMusic },
  { value: 'lyrics', label: 'Read along', icon: BookOpen },
];
const tabs = computed(() =>
  TABS.filter((t) => t.value !== 'lyrics' || hasShabad.value)
);

// A fresh open starts on the artwork, and a shabad without a read-along cannot
// stay on one — skipping from a tagged rendition to an untagged one would
// otherwise leave the screen on an empty panel.
//
// On the opening edge, not the closing one: the section stays mounted through
// its 200ms leave transition, so resetting as it goes flipped a lyrics or queue
// view back to the artwork while the listener watched it slide away.
watch(open, (isOpen) => {
  if (!isOpen) return;
  // Read along when the rendition has one — it is the reason to open a player
  // rather than glance at the bar, and most renditions carry no shabad id, so
  // this is a preference rather than the usual case. Failing that: nothing
  // loaded with something queued is the one state where the artwork has
  // nothing to draw, reachable only by queueing onto an idle transport, so it
  // opens on what the listener came here for. Otherwise the artwork.
  view.value = hasShabad.value
    ? 'lyrics'
    : !player.current.value && player.upNext.value.length
      ? 'queue'
      : 'art';
});
watch(hasShabad, (has) => {
  if (!has && view.value === 'lyrics') view.value = 'art';
});

const liveStatus = computed(() =>
  player.playing.value
    ? `Listening ${formatTime(player.elapsed.value)}`
    : 'Stopped'
);

// Focus moves in on open so the sheet is where the keyboard and a screen
// reader are, and Escape closes it as a dialog should.
const panel = useTemplateRef<HTMLElement>('panel');
watch(open, async (isOpen) => {
  if (!isOpen) return;
  await nextTick();
  panel.value?.focus();
});
onKeyStroke('Escape', () => {
  if (open.value) open.value = false;
});

/**
 * Swipe down to dismiss, from the handle only.
 *
 * The sheet follows the finger so the gesture is answered rather than merely
 * accepted, and snaps back below the threshold — a short drag has to read as a
 * refusal, or the next one is a guess.
 */
const DISMISS_PX = 110;
const dragY = ref(0);

function dismissDrag(down: PointerEvent) {
  // Capturing the pointer makes every later event for it — `click` included —
  // fire at the capturing element, so a press that started on the chevron never
  // reached the chevron: the sheet's one visible close control did nothing.
  // Anything interactive in this band handles its own press.
  if ((down.target as HTMLElement).closest('button, a')) return;
  const el = down.currentTarget as HTMLElement;
  el.setPointerCapture(down.pointerId);
  const from = down.clientY;
  const place = (e: PointerEvent) => {
    dragY.value = Math.max(0, e.clientY - from);
  };
  el.addEventListener('pointermove', place);
  el.addEventListener(
    'lostpointercapture',
    () => {
      el.removeEventListener('pointermove', place);
      if (dragY.value > DISMISS_PX) open.value = false;
      // Cleared in the same tick as the close, so the leave transition's own
      // transform is not overridden by a leftover inline one.
      dragY.value = 0;
    },
    { once: true }
  );
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-250 ease-out"
    leave-active-class="transition duration-200 ease-in"
    enter-from-class="translate-y-full"
    leave-to-class="translate-y-full"
  >
    <section
      v-if="open"
      ref="panel"
      role="dialog"
      aria-modal="true"
      aria-label="Now playing"
      tabindex="-1"
      class="fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain bg-background outline-none md:hidden"
      :style="dragY ? { transform: `translateY(${dragY}px)` } : undefined"
    >
      <!-- Handle and header are one drag surface: a thumb aiming for a 4px grip
           lands somewhere in this band, so the whole band answers the gesture —
           except over the chevron, which `dismissDrag` leaves alone. -->
      <div class="shrink-0 touch-none" @pointerdown="dismissDrag">
        <div
          class="mx-auto mt-2.5 h-1 w-10 rounded-full bg-muted-foreground/40"
        />
        <div class="flex items-center justify-between px-2 py-2">
          <Button
            variant="ghost"
            size="icon-sm"
            class="text-muted-foreground"
            aria-label="Collapse the player"
            @click="open = false"
          >
            <ChevronDown class="size-5" />
          </Button>
          <p
            class="text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
          >
            {{ player.isLive.value ? 'On air' : 'Now playing' }}
          </p>
          <!-- Balances the chevron so the label sits centred rather than
               drifting right by half a button. -->
          <span class="size-8" />
        </div>
      </div>

      <!-- Whatever is on show takes the height left over, so a tall phone gets a
           big tile and a short one still fits the controls without scrolling.
           `min-h-0` is what allows it to give that height back — and what lets
           the two scrolling views scroll instead of pushing the transport off
           the bottom of the screen. -->
      <div
        class="flex min-h-0 flex-1 flex-col justify-center"
        :class="
          view === 'art'
            ? 'items-center px-8 py-4'
            : // A scrolling view is cut off by this edge rather than ending at
              // it, so the edge has to be drawn — otherwise the last line
              // visible looks like a rendering fault rather than a fold.
              'border-b border-border'
        "
      >
        <LyricsPanel
          v-if="view === 'lyrics'"
          inline
          :open="true"
          class="min-h-0 flex-1"
        />
        <div
          v-else-if="view === 'queue'"
          class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3"
        >
          <QueueList />
        </div>
        <template v-else>
          <div
            v-if="player.isLive.value"
            class="grid aspect-square w-full max-w-xs place-items-center rounded-xl bg-primary/10"
          >
            <Radio
              class="size-20 text-primary"
              :class="player.playing.value && 'animate-pulse'"
            />
          </div>
          <ArtTile
            v-else-if="player.current.value"
            :name="player.current.value.artist ?? player.current.value.title"
            :photo="player.current.value.artistPhoto"
            class="aspect-square w-full max-w-xs rounded-xl text-5xl shadow-2xl"
          />
        </template>
      </div>

      <div class="shrink-0 px-6 pb-8">
        <p class="text-lg leading-snug font-semibold text-foreground">
          {{ player.current.value?.title ?? 'Nothing playing' }}
        </p>
        <!-- The way to the ragi from a phone, now that a list row is only a
             row: a real target with a caret to say where it goes, rather than
             a 14px line of text that has to be aimed at. Negative margin so the
             padding that makes it hittable does not indent the name away from
             the title above it. -->
        <NuxtLink
          v-if="player.current.value?.artist"
          :to="`/ragis/${encodeURIComponent(player.current.value.artist)}`"
          class="-mx-2 mt-0.5 flex max-w-full items-center gap-1 rounded-md px-2 py-2 text-sm text-muted-foreground transition active:bg-foreground/5 hover:text-foreground"
          @click="open = false"
        >
          <span class="truncate">{{ player.current.value.subtitle }}</span>
          <ChevronRight class="size-4 shrink-0 opacity-70" />
        </NuxtLink>
        <p v-else class="mt-0.5 truncate text-sm text-muted-foreground">
          {{ player.current.value?.subtitle ?? 'Pick a shabad to start' }}
        </p>

        <!-- A broadcast has no timeline: the connection is not seekable and
             its duration is Infinity, so the clock says how long you have been
             listening instead. -->
        <div
          v-if="player.isLive.value"
          class="mt-6 flex items-center justify-center gap-2"
        >
          <LiveBadge :pulse="player.playing.value" />
          <span class="text-xs tabular-nums text-muted-foreground">
            {{ liveStatus }}
          </span>
        </div>
        <SeekBar
          v-else
          expanded
          class="mt-5"
          :progress="player.progress.value"
          :elapsed="player.elapsed.value"
          :total="player.total.value"
          :disabled="!player.current.value"
          @seek="player.seekPct"
        />

        <PlayerControls size="lg" class="mt-4 justify-center" />

        <!-- Tabs rather than three toggles in a row: the two panels are
             alternatives to each other, and the strip says so. Pressing the
             lit one goes back to the artwork, which is the third state a
             phone has and a desktop does not. -->
        <div class="mt-4 flex items-center justify-center gap-1">
          <Button
            v-if="!player.isLive.value"
            variant="ghost"
            size="icon-sm"
            class="mr-2"
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
          <button
            v-for="t in tabs"
            :key="t.value"
            type="button"
            class="flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition"
            :class="
              view === t.value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground'
            "
            :aria-pressed="view === t.value"
            @click="show(t.value)"
          >
            <component :is="t.icon" class="size-4" />
            {{ t.label }}
          </button>
        </div>
      </div>
    </section>
  </Transition>
</template>
