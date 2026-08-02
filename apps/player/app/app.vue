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

        <nav class="flex-1 px-2">
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="relative flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
            active-class="!text-foreground"
          >
            <component :is="item.icon" class="size-[18px]" />
            {{ item.label }}
          </NuxtLink>
        </nav>
        <!-- Names the place rather than saying "Live now", which told you
             nothing you did not already know from the icon. The lit state
             follows the player, not the route: the broadcast keeps playing
             while you browse, and this is where you look to see that. -->
        <NuxtLink
          to="/live"
          class="mx-2 mb-3 flex items-center gap-2.5 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition hover:border-input hover:text-foreground"
          :class="player.isLive.value && '!border-primary/30 !text-primary'"
          active-class="!text-foreground"
        >
          <Radio
            class="size-[18px] shrink-0"
            :class="
              player.isLive.value && player.playing.value && 'animate-pulse'
            "
          />
          <span class="min-w-0 flex-1 truncate">Harmandir Sahib</span>
          <span
            class="rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-wider uppercase"
            :class="
              player.isLive.value && player.playing.value
                ? 'bg-primary/15 text-primary'
                : 'bg-muted text-muted-foreground'
            "
            >Live</span
          >
        </NuxtLink>

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
