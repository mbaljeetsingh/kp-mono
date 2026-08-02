<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue';
import { Home, Users, Heart, ListMusic, Radio } from 'lucide-vue-next';
import { usePlayer } from '~/composables/usePlayer';

const player = usePlayer();
const auth = useAuth();
const favorites = useFavorites();
const playlists = usePlaylists();
const audioEl = useTemplateRef<HTMLAudioElement>('audioEl');

// One <audio> element for the whole app so playback survives navigation — a
// shabad keeps playing while the listener browses, which is the single thing
// separating a music app from a page with an audio tag on it.
onMounted(() => {
  if (audioEl.value) player.attach(audioEl.value);

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
       (:root in shared-theme is the light parchment set) lives on <html>, set in
       nuxt.config — overlays portal to document.body and would miss it here. -->
  <div class="flex h-dvh flex-col bg-background text-foreground">
    <div class="flex min-h-0 flex-1">
      <aside
        class="hidden w-56 shrink-0 flex-col border-r border-border md:flex"
      >
        <NuxtLink to="/" class="flex items-center gap-2.5 px-5 py-4">
          <img src="/brand/logo-badge.svg" alt="" class="size-7 rounded-md" />
          <span class="text-[15px] font-semibold text-foreground">Kirtan</span>
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

        <div class="border-t border-border p-2"><AccountButton /></div>
      </aside>

      <main class="min-w-0 flex-1 overflow-y-auto">
        <div class="mx-auto max-w-5xl px-5 py-7 pb-10 md:px-8">
          <NuxtPage />
        </div>
      </main>
    </div>

    <!-- Streams straight from sgpc.net: it honours Range requests and is
         Cloudflare-cached, so nothing is proxied and bandwidth costs us nil. -->
    <audio
      ref="audioEl"
      preload="metadata"
      @timeupdate="player.onTimeUpdate"
      @loadedmetadata="player.onLoadedMetadata"
      @ended="player.next"
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
