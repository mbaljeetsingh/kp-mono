<script setup lang="ts">
/**
 * Previous, play/pause, next — the three controls that move playback.
 *
 * One component for the bar and the full player, because they are the same
 * controls and drifting apart is exactly what happens when they are typed out
 * twice. Only the size differs: a bar has room for a 36px play button, a full
 * player has a screen and deserves a target you do not have to aim at.
 */
import { Play, Pause, SkipBack, SkipForward } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { usePlayer } from '~/composables/usePlayer';

const props = defineProps<{
  /** `lg` is the full player's; the default is the transport bar's. */
  size?: 'lg';
  /** Hide Previous where there is no room for it — the phone's bar. */
  compact?: boolean;
}>();

const player = usePlayer();
const big = computed(() => props.size === 'lg');
</script>

<template>
  <div class="flex items-center" :class="big ? 'gap-6' : 'gap-2 md:gap-3'">
    <!-- Skip controls step through a queue position the broadcast does not
         have: there is nothing before now, and nothing after it. -->
    <Button
      v-if="!player.isLive.value"
      variant="ghost"
      :size="big ? 'icon-lg' : 'icon-sm'"
      class="text-muted-foreground"
      :class="compact && 'hidden md:inline-flex'"
      :disabled="!player.current.value"
      aria-label="Previous shabad"
      title="Previous (shift+← or P)"
      @click="player.previous"
    >
      <SkipBack :class="big ? 'size-6 fill-current' : 'size-4 fill-current'" />
    </Button>

    <Button
      size="icon"
      class="rounded-full transition hover:scale-105"
      :class="big ? 'size-16' : 'size-9'"
      :disabled="!player.current.value && !player.upNext.value.length"
      :aria-label="player.playing.value ? 'Pause' : 'Play'"
      :title="player.playing.value ? 'Pause (space)' : 'Play (space)'"
      @click="player.toggle"
    >
      <Pause
        v-if="player.playing.value"
        :class="big ? 'size-7 fill-current' : 'size-4 fill-current'"
      />
      <Play
        v-else
        :class="
          big
            ? 'size-7 translate-x-px fill-current'
            : 'size-4 translate-x-px fill-current'
        "
      />
    </Button>

    <Button
      v-if="!player.isLive.value"
      variant="ghost"
      :size="big ? 'icon-lg' : 'icon-sm'"
      class="text-muted-foreground"
      :disabled="!player.upNext.value.length"
      aria-label="Next shabad"
      title="Next (shift+→ or N)"
      @click="player.next"
    >
      <SkipForward
        :class="big ? 'size-6 fill-current' : 'size-4 fill-current'"
      />
    </Button>
  </div>
</template>
