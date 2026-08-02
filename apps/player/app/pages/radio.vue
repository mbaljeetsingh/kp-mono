<script setup lang="ts">
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-vue-next';
import {
  CHANNELS,
  DEFAULT_STATION,
  GURDWARAS,
  OTHER_GURDWARAS,
} from '~/lib/stations';

// `/live` was this page's address when there was one feed. Keeping it as an
// alias costs a line and saves every bookmark and link shared since.
definePageMeta({ alias: '/live' });

// Pinned above the list rather than given a full-height hero. The hero dated
// from there being one station: with forty it pushed the list off the screen
// and rendered Harimandir Sahib twice — once as the hero, again as the first
// row of Gurdwaras. It stays first and stays distinguished, because it is the
// darbar this archive was recorded from, but as a card and not a landing page.
const featured = DEFAULT_STATION;

const filter = ref('');
function matches(haystack: (string | null)[]) {
  const q = filter.value.trim().toLowerCase();
  if (!q) return true;
  return haystack.some((h) => h?.toLowerCase().includes(q));
}
const gurdwaras = computed(() =>
  OTHER_GURDWARAS.filter((s) => matches([s.name, s.place]))
);
const channels = computed(() =>
  CHANNELS.filter((s) => matches([s.name, s.place]))
);
// The featured card filters too, or typing a place would leave it stranded
// above an empty list looking like a match.
const showFeatured = computed(() => matches([featured.name, featured.place]));
const empty = computed(
  () => !gurdwaras.value.length && !channels.value.length && !showFeatured.value
);
</script>

<template>
  <div class="mx-auto max-w-3xl pb-6">
    <h1 class="text-2xl font-semibold text-foreground">Radio</h1>
    <p class="mt-1 mb-6 text-sm text-muted-foreground">
      Live kirtan from {{ GURDWARAS.length }} gurdwaras, and
      {{ CHANNELS.length }} channels programmed around the clock. No account
      needed.
    </p>

    <div v-if="showFeatured" class="mb-6">
      <StationCard :station="featured" featured />
    </div>

    <div class="relative mb-6">
      <Search
        class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        v-model="filter"
        placeholder="Filter by gurdwara or place"
        class="pl-9"
      />
    </div>

    <EmptyState
      v-if="empty"
      title="No stations match"
      :hint="`Nothing named or located like “${filter.trim()}”.`"
    />

    <section v-if="gurdwaras.length" class="mb-8">
      <h2 class="mb-1 text-lg font-semibold text-foreground">Gurdwaras</h2>
      <!-- Said plainly because it is true of every station below and there is
           no way to know it from the outside: a gurdwara's encoder runs during
           its own programme, so many are dark at any given hour, and a card
           that will not start is usually the schedule, not a fault. -->
      <p class="mb-3 text-sm text-muted-foreground">
        Each broadcasts during its own programme, so some are off air depending
        on the hour where they are.
      </p>
      <div class="space-y-1.5">
        <StationCard v-for="s in gurdwaras" :key="s.id" :station="s" />
      </div>
    </section>

    <section v-if="channels.length" class="mb-8">
      <h2 class="mb-1 text-lg font-semibold text-foreground">Channels</h2>
      <p class="mb-3 text-sm text-muted-foreground">
        Katha, simran, and the unbroken reading — playing whatever the hour.
      </p>
      <div class="space-y-1.5">
        <StationCard v-for="s in channels" :key="s.id" :station="s" />
      </div>
    </section>

    <!-- Whose bandwidth each feed is actually coming from. Two lines because
         they are two different arrangements: SGPC serves its own darbar, and
         SikhNet relays everything else on behalf of the gurdwaras. Naming only
         the second would imply the first was ours. -->
    <div
      class="space-y-1 border-t border-border pt-4 text-xs text-muted-foreground"
    >
      <p>
        {{ featured.name }} is streamed by
        <a
          href="https://sgpc.net/"
          target="_blank"
          rel="noopener noreferrer"
          class="underline hover:text-foreground"
          >SGPC</a
        >.
      </p>
      <p>
        Every other gurdwara and channel feed is relayed by
        <a
          href="https://www.sikhnet.com/s/sikhnetradio"
          target="_blank"
          rel="noopener noreferrer"
          class="underline hover:text-foreground"
          >SikhNet Radio</a
        >, which hosts them on behalf of each gurdwara.
      </p>
    </div>
  </div>
</template>
