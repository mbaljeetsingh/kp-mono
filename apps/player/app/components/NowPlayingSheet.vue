<script setup lang="ts">
/**
 * The full-screen player, opened by tapping the mini transport on a phone.
 *
 * The mini bar can only ever be a compromise: at 320px it has room for a
 * title, three controls and a 104px scrubber. Tapping it here is what every
 * phone music player does, and it is the only place a thumb gets a full-width
 * timeline and artwork big enough to see — so precise scrubbing lives here and
 * the bar stays a summary.
 *
 * Hand-rolled rather than the Drawer in layers/ui: vaul reads pointer moves on
 * its content to drag the sheet down, and the scrubber's own drag — which
 * captures the pointer and so keeps bubbling to its ancestors — would be read
 * as a dismiss. The dismiss gesture is confined to the handle at the top
 * instead, where nothing else wants the pointer.
 */
import {
  ChevronDown,
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

const player = usePlayer();
const open = defineModel<boolean>('open', { default: false });

/** Read-along and Up next draw over the mini bar, underneath this. Rather than
 *  open a panel nobody can see, both collapse the sheet on the way out. */
const emit = defineEmits<{ lyrics: []; queue: [] }>();

const hasShabad = computed(() => player.current.value?.shabadId != null);

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

      <!-- Artwork takes whatever height is left over, so a tall phone gets a
           big tile and a short one still fits the controls without scrolling.
           `min-h-0` is what allows it to give that height back. -->
      <div class="flex min-h-0 flex-1 items-center justify-center px-8 py-4">
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
      </div>

      <div class="shrink-0 px-6 pb-8">
        <p class="text-lg leading-snug font-semibold text-foreground">
          {{ player.current.value?.title ?? 'Nothing playing' }}
        </p>
        <p class="mt-0.5 truncate text-sm text-muted-foreground">
          <NuxtLink
            v-if="player.current.value?.artist"
            :to="`/ragis/${encodeURIComponent(player.current.value.artist)}`"
            class="hover:text-foreground hover:underline"
            @click="open = false"
            >{{ player.current.value.subtitle }}</NuxtLink
          >
          <template v-else>{{
            player.current.value?.subtitle ?? 'Pick a shabad to start'
          }}</template>
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

        <div class="mt-4 flex items-center justify-center gap-6">
          <Button
            v-if="!player.isLive.value"
            variant="ghost"
            size="icon-lg"
            class="text-muted-foreground"
            :disabled="!player.current.value"
            aria-label="Previous shabad"
            @click="player.previous"
          >
            <SkipBack class="size-6 fill-current" />
          </Button>
          <Button
            size="icon"
            class="size-16 rounded-full transition hover:scale-105"
            :disabled="!player.current.value"
            :aria-label="player.playing.value ? 'Pause' : 'Play'"
            @click="player.toggle"
          >
            <Pause v-if="player.playing.value" class="size-7 fill-current" />
            <Play v-else class="size-7 translate-x-px fill-current" />
          </Button>
          <Button
            v-if="!player.isLive.value"
            variant="ghost"
            size="icon-lg"
            class="text-muted-foreground"
            :disabled="!player.upNext.value.length"
            aria-label="Next shabad"
            @click="player.next"
          >
            <SkipForward class="size-6 fill-current" />
          </Button>
        </div>

        <div class="mt-4 flex items-center justify-center gap-2">
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
            @click="player.toggleRepeat"
          >
            <Repeat1 class="size-4" />
          </Button>
          <Button
            v-if="hasShabad"
            variant="ghost"
            size="sm"
            class="gap-2 text-muted-foreground"
            @click="emit('lyrics')"
          >
            <BookOpen class="size-4" /> Read along
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="gap-2 text-muted-foreground"
            @click="emit('queue')"
          >
            <ListMusic class="size-4" /> Up next
          </Button>
        </div>
      </div>
    </section>
  </Transition>
</template>
