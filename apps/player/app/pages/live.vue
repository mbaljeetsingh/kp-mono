<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Radio } from 'lucide-vue-next';
import { usePlayer, formatTime } from '~/composables/usePlayer';

const player = usePlayer();

// The stream definition lives in usePlayer: the sidebar and the mobile tab bar
// light up from the same playback state, so the URL cannot live on this page.
const onAir = computed(() => player.isLive.value && player.playing.value);

// Time spent listening, not a position in the broadcast — there is no such
// thing to report for a feed that has been running since long before you
// tuned in.
const listening = computed(() => formatTime(player.currentTime.value));
</script>

<template>
  <div class="grid place-items-center py-20 text-center">
    <div
      class="grid size-24 place-items-center rounded-full transition"
      :class="onAir ? 'bg-primary/15' : 'bg-primary/10'"
    >
      <Radio class="size-10 text-primary" :class="onAir && 'animate-pulse'" />
    </div>

    <h1 class="mt-6 text-2xl font-semibold text-foreground">Live Kirtan</h1>
    <p class="mt-1 text-sm text-muted-foreground">
      Streaming now from Sri Harmandir Sahib, Amritsar
    </p>

    <!-- Reserved whether or not it is playing, so starting the stream does not
         shift the button down under the listener's finger. -->
    <div class="mt-4 flex h-6 items-center gap-2">
      <template v-if="onAir">
        <LiveBadge pulse />
        <span class="text-xs tabular-nums text-muted-foreground">
          Listening {{ listening }}
        </span>
      </template>
      <span v-else class="text-xs text-muted-foreground">
        28 kbps AAC+ · no account needed
      </span>
    </div>

    <Button
      size="lg"
      class="mt-3 rounded-full px-8 font-semibold transition hover:scale-105"
      @click="player.toggleLive"
    >
      {{ onAir ? 'Stop' : 'Listen live' }}
    </Button>

    <p
      v-if="player.upNext.value.length"
      class="mt-5 max-w-xs text-xs text-muted-foreground"
    >
      Your queue is kept — {{ player.upNext.value.length }} shabad{{
        player.upNext.value.length === 1 ? '' : 's'
      }}
      still lined up for when you come back.
    </p>
  </div>
</template>
