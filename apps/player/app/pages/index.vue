<script setup lang="ts">
import { Search, Shuffle } from 'lucide-vue-next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { usePlayer, toPlayable } from '~/composables/usePlayer';
import { GITHUB_URL, CONTRIBUTE_URL } from '~/lib/links';

const supabase = useSupabaseClient();
const player = usePlayer();
const q = ref('');
const debounced = refDebounced(q, 250);

// Everything the player shows comes from published shabads, never raw files —
// a 70-minute set or a 37-minute archival performance isn't listenable until
// somebody has marked where each shabad begins and ends.
const { data: results } = await useAsyncData(
  'search',
  async () => {
    const term = debounced.value.trim();
    if (term.length < 2) return null;
    const v = escapeFilterValue(term);
    const { data, error } = await supabase
      .from('shabads')
      .select('*')
      .or(`name.ilike.${v},artist.ilike.${v},raag.ilike.${v}`)
      .limit(60);
    if (error) console.error('search failed', error.message);
    return data ?? [];
  },
  { watch: [debounced] }
);

/**
 * Play a random handful of the archive.
 *
 * The other three ways in all need the listener to name something first: a term
 * to search, a ragi to open, or a row to recognise on the shelf below. This is
 * the one for arriving with nothing in mind, which for kirtan is not the
 * unusual case — and it sits beside the search box because that is exactly
 * where somebody stalls when they have nothing to type into it.
 *
 * The randomness is the database's (`random_shabads`, 20260830000100): PostgREST
 * has no `order=random()` to send, and the client-side substitutes are either N
 * round trips or a contiguous window, which is not a sample.
 */
// Enough to listen through without thinking about it again, few enough that the
// queue panel stays readable and a reshuffle is cheap. The queue is the
// listener's from the moment it lands — Clear and Shuffle in Up next both act
// on it like any other list.
const SHUFFLE_SIZE = 30;

const shuffling = ref(false);

async function shuffleArchive() {
  // The RPC is quick, but a double press would build the queue twice and start
  // the second one over the first.
  if (shuffling.value) return;
  shuffling.value = true;
  try {
    const { data, error } = await supabase.rpc('random_shabads', {
      n: SHUFFLE_SIZE,
    });
    if (error) {
      console.error('shuffle failed', error.message);
      return;
    }
    const items = ((data as any[]) ?? []).map(toPlayable);
    // Nothing published yet. The button is hidden in that case, so this is the
    // race where the archive emptied under us rather than a state to explain.
    if (!items.length) return;
    player.playList(items, 0);
  } finally {
    shuffling.value = false;
  }
}

// A shelf, not the archive. This scrolled forever in pages of 50, so "recently
// added" grew into every published shabad there has ever been and home had no
// bottom — while the thing it is actually answering is "what is new since I was
// last here", which twenty rows covers. The archive itself is one link away, on
// /shabads, which is where the endless list belongs.
const RECENT_LIMIT = 20;

const { data: recent } = await useAsyncData('recent', async () => {
  const { data, error } = await supabase
    .from('shabads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(RECENT_LIMIT);
  if (error) console.error('recent failed', error.message);
  return data ?? [];
});

const { data: artists } = await useAsyncData('top-artists', async () => {
  const { data } = await supabase.rpc('artist_counts');
  return (data as any[]) ?? [];
});
</script>

<template>
  <div>
    <!-- The two ways to start, side by side: name something, or let the
         archive pick. They share a row because they answer the same question,
         and the shuffle is the answer when the box is still empty. -->
    <div class="mb-8 flex max-w-xl items-center gap-2">
      <div class="relative min-w-0 flex-1">
        <Search
          class="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          v-model="q"
          type="search"
          placeholder="Search shabads, artists, raags"
          class="h-12 rounded-full border-0 bg-muted pr-4 pl-10 text-base md:text-sm"
        />
      </div>
      <!-- Only once there is something to shuffle. An archive with nothing
           published says so in the shelf below; a button that starts silence
           would be a worse way to learn it. -->
      <!-- The glyph alone. It is the one icon every music app has taught, the
           row reads as two controls rather than a field with a slogan beside
           it, and dropping the word gives the search box back ~70px — which on
           a 375px phone is the difference between reading your query and
           scrolling it. The label it loses as text it keeps as an accessible
           name: without one this announces as "button". -->
      <Button
        v-if="recent?.length"
        class="size-12 shrink-0 rounded-full"
        :disabled="shuffling"
        aria-label="Shuffle the archive"
        title="Play a random selection from the archive"
        @click="shuffleArchive"
      >
        <Shuffle class="size-5" />
      </Button>
    </div>

    <section v-if="results">
      <h2 class="mb-3 text-lg font-semibold text-foreground">
        {{ results.length }} shabad{{ results.length === 1 ? '' : 's' }}
      </h2>
      <ShabadRow
        v-for="(s, i) in results"
        :key="s.id"
        :shabad="s"
        :index="i"
        :list="results"
      />
      <EmptyState
        v-if="!results.length"
        title="No shabads matched"
        hint="Only tagged shabads are searchable. Coverage grows as contributors tag."
      />
    </section>

    <template v-else>
      <section v-if="artists?.length" class="mb-10">
        <!-- 12 divides evenly into every breakpoint's column count, so the
             grid always ends on a full row and the cut never looks accidental.
             That is also why it needs saying out loud that there are more. -->
        <div class="mb-4 flex items-baseline justify-between gap-4">
          <h2 class="text-xl font-semibold text-foreground">Ragis</h2>
          <NuxtLink
            v-if="artists.length > 12"
            to="/ragis"
            class="shrink-0 text-xs text-muted-foreground transition hover:text-foreground"
          >
            View all {{ artists.length }}
          </NuxtLink>
        </div>
        <!-- A shelf on a phone, a grid where there is width for one.
             Twelve tiles two-across cost 1414px — 2.6 screens of a 390px
             phone — so a first visit was a wall of circles and the first
             shabad you could actually play sat three screens down. Sideways is
             the direction a phone has to spare, which is why every music app
             browses entities this way.
             Bleeding the row past the page's padding, and putting that padding
             back inside it, is what lets a tile scroll off the edge instead of
             being clipped short of it. -->
        <div
          class="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-6"
        >
          <ArtistCard
            v-for="a in artists.slice(0, 12)"
            :key="a.artist"
            :name="a.artist"
            :display="a.display_name"
            :photo="a.photo_path"
            :count="a.shabads"
            class="w-32 shrink-0 sm:w-auto"
          />
        </div>
      </section>

      <section>
        <!-- The heading carries the way out of the shelf, the same way the
             Ragis heading does. No count beside it: `artist_counts()` hands
             that number over for free and there is no equivalent for shabads,
             so naming one would cost a query to say something the list below
             is already showing. -->
        <div class="mb-1 flex items-baseline justify-between gap-4">
          <h2 class="text-xl font-semibold text-foreground">Recently added</h2>
          <NuxtLink
            v-if="recent?.length"
            to="/shabads"
            class="shrink-0 text-xs text-muted-foreground transition hover:text-foreground"
          >
            View all
          </NuxtLink>
        </div>
        <ShabadRow
          v-for="(s, i) in recent ?? []"
          :key="s.id"
          :shabad="s"
          :index="i"
          :list="recent ?? []"
        />
        <EmptyState
          v-if="!recent?.length"
          title="No shabads published yet"
          hint="Tag a few in the admin app and publish them — they appear here immediately."
        />
      </section>
    </template>

    <!-- The ask, at the natural stopping point. Everything above exists
         because somebody tagged a recording, and the player itself offers no
         way to join in — so the bottom of home names the two doors: the
         tagging workbench and the repository. New tabs on purpose: both are
         other apps, and following a link must not stop what is playing. -->
    <footer
      class="mt-14 border-t border-border pt-5 text-xs text-muted-foreground"
    >
      <p class="max-w-xl leading-relaxed">
        Kirtan Player is open source, and the archive grows one tagged shabad at
        a time.
        <a
          :href="CONTRIBUTE_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="text-foreground/80 underline underline-offset-2 transition hover:text-foreground"
          >Help tag recordings</a
        >
        or
        <a
          :href="GITHUB_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="text-foreground/80 underline underline-offset-2 transition hover:text-foreground"
          >contribute code on GitHub</a
        >.
      </p>
    </footer>
  </div>
</template>
