<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue';
import {
  Home,
  Users,
  Heart,
  ListMusic,
  Radio,
  Github,
  Tags,
} from 'lucide-vue-next';
import { GITHUB_URL, CONTRIBUTE_URL } from '~/lib/links';
import { usePlayer } from '~/composables/usePlayer';
import { usePlayerKeys } from '~/composables/usePlayerKeys';
import { initTheme, THEME_KEY } from '~/composables/useTheme';
import { useNowPlayingView } from '~/composables/useNowPlayingView';

const player = usePlayer();
const auth = useAuth();
const favorites = useFavorites();
const playlists = usePlaylists();
const audioEl = useTemplateRef<HTMLAudioElement>('audioEl');
const mainEl = useTemplateRef<HTMLElement>('mainEl');
const nowPlayingView = useNowPlayingView();

const route = useRoute();
watch(
  () => route.fullPath,
  () => {
    // Any navigation closes the full player — both sizes of it. Its own ragi
    // link, the sidebar, the tab bar — all of them would otherwise land on a
    // page drawn behind an opaque overlay, which looks exactly like a dead
    // click. The phone's sheet had no watcher of its own at all until its flag
    // moved into the composable, so a back gesture left it parked over the
    // restored page: the same bug MobileTabBar's watcher exists to prevent.
    //
    // Clicking a link *to the page already showing* is the case a watcher
    // cannot cover — the route never moves — so the nav items below close it
    // themselves as well.
    nowPlayingView.close();

    // …and starts the new page at the top. The scrolling box is `main`, not the
    // window, so vue-router's own scroll handling never touches it: it resets
    // `window`, which here never moved. The container simply kept whatever
    // offset the last page left behind, so arriving anywhere from a scrolled
    // list dropped you into the middle of it — on a short page, past the end of
    // it entirely, showing blank.
    resetScroll();
  }
);

function resetScroll() {
  mainEl.value?.scrollTo({ top: 0 });
}

/**
 * A nav click that is going to land on a page in THIS window.
 *
 * The watcher above cannot cover a link to the page already showing — no route
 * change, no dead-click fix — so the nav items close the player themselves. But
 * NuxtLink leaves a modified click to the browser: cmd or ctrl opens a new tab,
 * shift a new window, alt downloads, and this window stays exactly where it is.
 * Closing the player on those collapsed it in the window the listener was still
 * looking at, over a click they made about a different one.
 */
function onNavClick(event: MouseEvent) {
  if (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  ) {
    return;
  }
  nowPlayingView.close();
}

// Twice, because the route updates before the page does. Every list here awaits
// its first page, so Suspense keeps the outgoing component on screen until that
// resolves — and a reset fired on the route change alone lands while the old
// content is still mounted, leaving the incoming page free to be scrolled again
// once it swaps in. `page:finish` runs after the new page is actually rendered,
// which is the one moment the offset is certain to stick. The watcher above
// stays: it kills the visible jump while the next page is still loading.
useNuxtApp().hook('page:finish', () => {
  resetScroll();
});

// Here rather than in PlayerBar: the transport outlives every page, so its keys
// should too, and this is the one component that is always mounted.
usePlayerKeys();

/**
 * The theme, before the first paint.
 *
 * The saved choice lives in localStorage, which the server cannot read, and
 * "follow the device" cannot be answered there at all — so SSR ships no theme
 * class and this resolves it while <head> is still parsing, ahead of any paint.
 * Anything later, `onMounted` included, is a flash of the wrong palette on
 * every navigation to the app.
 *
 * Written by hand rather than through `htmlAttrs`: unhead would then manage the
 * same attribute and overwrite whatever this decided during hydration. It is
 * also why the string is inlined rather than importing THEME_KEY — this runs
 * before any bundle — with the constant interpolated so the two cannot drift.
 */
useHead({
  script: [
    {
      tagPosition: 'head',
      innerHTML: `(function(){try{var c=localStorage.getItem('${THEME_KEY}');document.documentElement.classList.toggle('dark',c==='dark'||(c!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches))}catch(e){document.documentElement.classList.add('dark')}})()`,
    },
  ],
});

// One <audio> element for the whole app so playback survives navigation — a
// shabad keeps playing while the listener browses, which is the single thing
// separating a music app from a page with an audio tag on it.
onMounted(() => {
  if (audioEl.value) player.attach(audioEl.value);

  // Takes over from the pre-paint script: reads the same saved choice into
  // reactive state and starts following the device's own setting.
  initTheme();

  // Auth is client-only: the Supabase client persists no session on the server,
  // so SSR renders every page signed-out and this is what personalises it after
  // hydration. Never in setup — that runs on the server too.
  void auth.init();
  // Both watch the session for the rest of the app's life, so they are started
  // once, here, rather than by whichever row component happened to render first.
  favorites.sync();
  playlists.sync();
});

const nav = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/radio', label: 'Radio', icon: Radio, radio: true },
  { to: '/ragis', label: 'Ragis', icon: Users },
  { to: '/favorites', label: 'Favorites', icon: Heart },
  { to: '/playlists', label: 'Playlists', icon: ListMusic },
];
</script>

<template>
  <!-- One continuous surface. Earlier this was three floating panels with gaps
       between them, which read as separate widgets rather than one app; the
       regions are now separated by hairlines on a single background. -->
  <!-- The `dark` class that makes the shared tokens resolve to the dark palette
       (:root in shared-theme is the light parchment set) lives on <html>, written
       by the pre-paint script above and then by useTheme — overlays portal to
       document.body and would miss it here. -->
  <div class="flex h-dvh flex-col bg-background text-foreground">
    <div class="flex min-h-0 flex-1">
      <aside
        class="hidden w-56 shrink-0 flex-col border-r border-border md:flex"
      >
        <NuxtLink
          to="/"
          class="flex items-center gap-2.5 px-5 py-4"
          @click="onNavClick"
        >
          <img src="/brand/logo-badge.svg" alt="" class="size-7 rounded-md" />
          <span class="text-[15px] font-semibold text-foreground"
            >Kirtan Player</span
          >
        </NuxtLink>

        <!-- Radio is an ordinary destination in this list, not the bordered
             panel it used to be. That panel existed to name the one broadcast
             and offer the one place to start it; with forty stations the
             destination is a directory like Ragis or Playlists, and the
             station currently on air is already named by the player bar.
             What is kept is the lit state, which follows the *player* rather
             than the route — a station keeps playing while you browse, and
             this is where you look to see that. -->
        <nav class="flex-1 px-2">
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="relative flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
            :class="item.radio && player.isLive.value && '!text-primary'"
            active-class="!text-foreground"
            @click="onNavClick"
          >
            <component
              :is="item.icon"
              class="size-[18px]"
              :class="
                item.radio &&
                player.isLive.value &&
                player.playing.value &&
                'animate-pulse'
              "
            />
            {{ item.label }}
            <!-- Only while something is actually on air: a permanent badge
                 would say nothing, and this is the one row whose state
                 changes without the listener being on the page. -->
            <span
              v-if="item.radio && player.isLive.value && player.playing.value"
              class="ml-auto size-1.5 rounded-full bg-primary"
            />
          </NuxtLink>
        </nav>

        <!-- The meta block: rows where the app talks about itself rather than
             navigates itself. The ask leads it — taggers are the scarce
             resource, and the primary colour alone is the highlight — with
             GitHub quiet below it: developers find a repo from anywhere.
             New tabs on purpose — following either must not stop what is
             playing. -->
        <div class="border-t border-border p-2">
          <a
            :href="CONTRIBUTE_URL"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-primary transition hover:bg-accent"
          >
            <Tags class="size-[18px]" />
            Contribute shabads
          </a>
          <a
            :href="GITHUB_URL"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <Github class="size-[18px]" />
            GitHub
          </a>
          <ThemeToggle />
          <AccountButton />
        </div>
      </aside>

      <!-- The wrapper is the positioning context, not `main` itself: `main`
           is the scroll container, so an overlay anchored to it would sit at
           the scroll origin and slide off the top of the window the moment a
           list was scrolled. This div never scrolls, so `inset-0` is the
           visible area whatever the page underneath is doing. -->
      <div class="relative flex min-w-0 flex-1">
        <main ref="mainEl" class="min-w-0 flex-1 overflow-y-auto">
          <div class="mx-auto max-w-5xl px-5 py-7 pb-10 md:px-8">
            <NuxtPage />
          </div>
        </main>

        <!-- Over the content area, not the window: the sidebar stays put and
             the transport below keeps its controls, so the full player needs
             none of its own. `main` stays mounted and scrolled, so closing it
             returns to the list exactly where it was left. -->
        <NowPlayingView
          v-if="nowPlayingView.open.value"
          class="absolute inset-0 hidden md:flex"
        />
      </div>
    </div>

    <!-- Streams straight from sgpc.net: it honours Range requests and is
         Cloudflare-cached, so nothing is proxied and bandwidth costs us nil. -->
    <audio
      ref="audioEl"
      preload="metadata"
      @timeupdate="player.onTimeUpdate"
      @loadedmetadata="player.onLoadedMetadata"
      @ended="player.itemEnded(true)"
      @error="player.onError"
    />

    <PlayerBar />
    <MobileTabBar />

    <!-- One instance of each for the whole app: both are opened from row menus
         and empty states, and a dialog per row would mean one mounted dialog
         per visible shabad. -->
    <AuthDialog />
    <NewPlaylistDialog />
  </div>
</template>
