<script setup lang="ts">
import {
  Radio,
  Play,
  Square,
  ExternalLink,
  CalendarDays,
} from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import type { Station } from '@kp/shared/types';
import { usePlayer } from '~/composables/usePlayer';
import { stationPlayableId } from '~/lib/stations';

const props = defineProps<{
  station: Station;
  /** Pinned above the list: a bordered panel and a larger transport, so the
   *  one station most listeners came for is reachable without scanning forty
   *  identical rows. Same component so the two never drift apart. */
  featured?: boolean;
}>();

const player = usePlayer();

const id = computed(() => stationPlayableId(props.station));
const selected = computed(() => player.current.value?.id === id.value);
const onAir = computed(() => selected.value && player.playing.value);

// Failure is the ordinary state for a gurdwara between programmes, so it is
// shown in place of the quality line rather than as an error. It clears when
// the listener tries again — an encoder that was off a minute ago may not be.
const unavailable = computed(() => player.failed.value.has(id.value));

// Only while an attempt is actually in flight. Deriving it from
// `selected && !playing` also matched a station the listener had just stopped,
// which then sat reading "Connecting…" indefinitely.
const connecting = computed(() => player.starting.value === id.value);

const subtitle = computed(() =>
  props.featured
    ? [props.station.place, props.station.quality].filter(Boolean).join(' · ')
    : props.station.place
);
</script>

<template>
  <div
    class="flex items-center gap-3 rounded-lg transition"
    :class="[
      featured ? 'border border-border p-4' : 'p-3',
      selected
        ? 'bg-primary/10'
        : featured
          ? 'bg-card hover:bg-muted'
          : 'bg-card/60 hover:bg-muted',
    ]"
  >
    <Button
      size="icon"
      :variant="onAir ? 'default' : 'secondary'"
      class="shrink-0 rounded-full transition hover:scale-105"
      :class="featured ? 'size-14' : 'size-11'"
      :title="onAir ? `Stop ${station.name}` : `Listen to ${station.name}`"
      @click="player.toggleLive(station)"
    >
      <Square
        v-if="onAir"
        class="fill-current"
        :class="featured ? 'size-5' : 'size-4'"
      />
      <Play
        v-else
        class="translate-x-px fill-current"
        :class="featured ? 'size-5' : 'size-4'"
      />
    </Button>

    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <p
          class="truncate font-medium"
          :class="[
            featured ? 'text-base' : 'text-sm',
            selected ? 'text-primary' : 'text-foreground',
          ]"
        >
          {{ station.name }}
        </p>
        <LiveBadge v-if="onAir" pulse class="shrink-0" />
      </div>

      <p class="truncate text-xs text-muted-foreground">
        <template v-if="unavailable">Off air right now</template>
        <template v-else-if="connecting">Connecting…</template>
        <!-- The pinned card has the room for the bitrate; a list row does not,
             and forty of them would read as noise rather than information. -->
        <template v-else>{{ subtitle }}</template>
      </p>
    </div>

    <!-- The gurdwara's own pages. Worth carrying: the schedule is how you know
         which ragi jatha has the slot you are listening to, and this project
         has no roster of its own for anywhere but Amritsar. -->
    <div class="hidden shrink-0 items-center gap-0.5 sm:flex">
      <Button
        v-if="station.schedule"
        as="a"
        :href="station.schedule"
        target="_blank"
        rel="noopener noreferrer"
        variant="ghost"
        size="icon-sm"
        class="text-muted-foreground"
        title="Today's programme"
      >
        <CalendarDays class="size-4" />
      </Button>
      <Button
        v-if="station.video"
        as="a"
        :href="station.video"
        target="_blank"
        rel="noopener noreferrer"
        variant="ghost"
        size="icon-sm"
        class="text-muted-foreground"
        title="Watch live"
      >
        <Radio class="size-4" />
      </Button>
      <Button
        v-if="station.website"
        as="a"
        :href="station.website"
        target="_blank"
        rel="noopener noreferrer"
        variant="ghost"
        size="icon-sm"
        class="text-muted-foreground"
        title="Website"
      >
        <ExternalLink class="size-4" />
      </Button>
    </div>
  </div>
</template>
