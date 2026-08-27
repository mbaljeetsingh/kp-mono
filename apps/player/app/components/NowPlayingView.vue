<script setup lang="ts">
/**
 * The desktop full player.
 *
 * It fills the content area and leaves the sidebar and the transport bar
 * standing, which is the whole reason it is this simple: the bar below already
 * has the controls, the clock and the timeline, so this has none of its own.
 * It is artwork, what is playing, and the two things worth a whole column —
 * the queue and the read-along — as tabs.
 *
 * Over the page rather than instead of it, so closing it returns to the list
 * exactly where it was left, scroll position and all.
 */
import { ListMusic, BookOpen, Radio } from 'lucide-vue-next';
import { usePlayer } from '~/composables/usePlayer';

const player = usePlayer();

const hasShabad = computed(() => player.current.value?.shabadId != null);

type Tab = 'queue' | 'lyrics';

// Read along is what this opens on: a published shabad carries a shabad id, so
// the text is there to follow, and following it is the reason to open a player
// rather than glance at the bar. The queue is the fallback for the renditions
// that have not been linked yet. Set once, as the view mounts — which is every
// time it is opened — so a track change mid-browse does not yank the panel off
// the queue while it is being read.
const tab = ref<Tab>(
  player.current.value?.shabadId != null ? 'lyrics' : 'queue'
);

// A rendition without a read-along cannot sit on that tab — skipping from a
// tagged shabad to an untagged one would leave the column on an empty panel.
watch(hasShabad, (has) => {
  if (!has && tab.value === 'lyrics') tab.value = 'queue';
});

const TABS: { value: Tab; label: string; icon: any }[] = [
  { value: 'queue', label: 'Up next', icon: ListMusic },
  { value: 'lyrics', label: 'Read along', icon: BookOpen },
];
const tabs = computed(() =>
  TABS.filter((t) => t.value !== 'lyrics' || hasShabad.value)
);
</script>

<template>
  <div class="flex size-full min-h-0 flex-col overflow-hidden bg-background">
    <div
      class="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-8 px-8 py-8 lg:flex-row"
    >
      <!-- The artwork keeps its own column rather than being swapped out by a
           tab: there is width for both, and losing the tile every time you
           check the queue is what makes a player feel like a different page. -->
      <div class="shrink-0 lg:w-72 lg:self-start xl:w-80">
        <div
          v-if="player.isLive.value"
          class="grid aspect-square w-full max-w-72 place-items-center rounded-xl bg-primary/10"
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
          class="aspect-square w-full max-w-72 rounded-xl text-5xl shadow-xl"
        />
        <div
          v-else
          class="grid aspect-square w-full max-w-72 place-items-center rounded-xl bg-muted text-sm text-muted-foreground"
        >
          Nothing playing
        </div>

        <p class="mt-4 text-lg leading-snug font-semibold text-foreground">
          {{ player.current.value?.title ?? 'Nothing playing' }}
        </p>
        <div class="mt-1 flex items-center gap-2">
          <LiveBadge v-if="player.isLive.value" :pulse="player.playing.value" />
          <NuxtLink
            v-if="player.current.value?.artist"
            :to="`/ragis/${encodeURIComponent(player.current.value.artist)}`"
            class="truncate text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            {{ player.current.value.subtitle }}
          </NuxtLink>
          <p v-else class="truncate text-sm text-muted-foreground">
            {{ player.current.value?.subtitle ?? 'Pick a shabad to start' }}
          </p>
        </div>
      </div>

      <!-- The tabs. `min-h-0` is what lets their content scroll rather than
           push the column past the bottom of the window. -->
      <div class="flex min-h-0 w-full flex-1 flex-col">
        <div class="flex shrink-0 gap-4 border-b border-border">
          <button
            v-for="t in tabs"
            :key="t.value"
            type="button"
            class="-mb-px flex items-center gap-2 border-b-2 px-1 pb-2 text-sm font-medium transition"
            :class="
              tab === t.value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            "
            :aria-current="tab === t.value || undefined"
            @click="tab = t.value"
          >
            <component :is="t.icon" class="size-4" />
            {{ t.label }}
          </button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto pt-3">
          <LyricsPanel
            v-if="tab === 'lyrics' && hasShabad"
            inline
            :open="true"
            class="size-full"
          />
          <QueueList v-else />
        </div>
      </div>
    </div>
  </div>
</template>
