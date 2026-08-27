<script setup lang="ts">
/**
 * The phone's navigation: four destinations and everything else.
 *
 * Five slots is the ceiling for a thumb-reachable bar — past that the targets
 * get too narrow to hit reliably — and the app has more than five places to be.
 * So the fifth is More, and Saved goes inside it along with the two controls
 * that had nowhere else to live on touch: the theme and the account. Before
 * this they rode in the saved pages' header, which meant the only way to change
 * the theme was to first navigate somewhere unrelated to it.
 *
 * A bottom sheet rather than a popover: the trigger is already at the bottom
 * edge, so a popover anchored to it has nowhere to go, and a sheet is what the
 * same bar in np-mono opens.
 */
import {
  Home,
  Search,
  Users,
  Radio,
  Menu,
  Heart,
  ListMusic,
  Check,
  LogIn,
  LogOut,
  User,
} from 'lucide-vue-next';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { usePlayer } from '~/composables/usePlayer';
import { useTheme, THEME_OPTIONS } from '~/composables/useTheme';

const player = usePlayer();
const auth = useAuth();
const theme = useTheme();
const route = useRoute();

const tabs = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/ragis', label: 'Ragis', icon: Users },
  // Lit whenever a station is playing, wherever the listener has navigated to
  // — the same signal the sidebar carries on desktop.
  { to: '/radio', label: 'Radio', icon: Radio, live: true },
];

const saved = [
  { to: '/favorites', label: 'Favorites', icon: Heart },
  { to: '/playlists', label: 'Playlists', icon: ListMusic },
];

const onAir = computed(() => player.isLive.value && player.playing.value);

const open = ref(false);

// `active-class` is a NuxtLink affordance and More is a button, so its lit
// state is computed. It covers the pages that live inside the sheet as well as
// the sheet itself — otherwise no tab lights at all on /favorites, and the
// listener has no answer to "where am I". startsWith, because /playlists/[id]
// is a real route and it is still Saved.
const moreActive = computed(
  () =>
    open.value ||
    saved.some(
      (link) => route.path === link.to || route.path.startsWith(link.to + '/')
    )
);
</script>

<template>
  <nav class="flex border-t border-border bg-background md:hidden">
    <NuxtLink
      v-for="tab in tabs"
      :key="tab.to"
      :to="tab.to"
      class="flex flex-1 flex-col items-center gap-1 py-2 text-[10px] text-muted-foreground transition"
      :class="tab.live && onAir && '!text-primary'"
      active-class="!text-foreground"
    >
      <component
        :is="tab.icon"
        class="size-5"
        :class="tab.live && onAir && 'animate-pulse'"
      />
      {{ tab.label }}
    </NuxtLink>

    <button
      type="button"
      class="flex flex-1 flex-col items-center gap-1 py-2 text-[10px] text-muted-foreground transition"
      :class="moreActive && '!text-foreground'"
      :aria-expanded="open"
      @click="open = true"
    >
      <Menu class="size-5" />
      More
    </button>
  </nav>

  <Sheet v-model:open="open">
    <!-- Capped and scrollable: `side="bottom"` is h-auto, and a phone held
         sideways is ~375px tall — enough for the list to run off the top of the
         screen with no way to reach what it pushed off. -->
    <SheetContent
      side="bottom"
      class="max-h-[85dvh] gap-0 overflow-y-auto pb-[env(safe-area-inset-bottom)]"
    >
      <SheetHeader class="pb-2">
        <SheetTitle>More</SheetTitle>
        <SheetDescription class="sr-only">
          Saved shabads, theme, and your account.
        </SheetDescription>
      </SheetHeader>

      <div class="px-2 pb-2">
        <!-- Closed by hand on every row: the sheet is a fixed overlay, so
             without this it stays parked over the page just navigated to. -->
        <NuxtLink
          v-for="link in saved"
          :key="link.to"
          :to="link.to"
          class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-accent"
          active-class="!text-foreground"
          @click="open = false"
        >
          <component :is="link.icon" class="size-[18px] shrink-0" />
          {{ link.label }}
        </NuxtLink>

        <Separator class="my-2" />

        <!-- The three choices flat rather than ThemeToggle's dropdown: a menu
             inside a sheet is an overlay over an overlay, and it would put the
             thing this sheet exists to expose one extra tap away. -->
        <div class="px-3 py-1 text-xs font-medium text-muted-foreground">
          Theme
        </div>
        <button
          v-for="option in THEME_OPTIONS"
          :key="option.value"
          type="button"
          class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm transition hover:bg-accent"
          :class="
            theme.choice.value === option.value
              ? 'text-foreground'
              : 'text-muted-foreground'
          "
          @click="theme.set(option.value)"
        >
          <component :is="option.icon" class="size-[18px] shrink-0" />
          {{ option.label }}
          <Check
            v-if="theme.choice.value === option.value"
            class="ml-auto size-4"
          />
        </button>

        <!-- Nothing until the stored session has been read, for the reason
             AccountButton gives: the signed-out state would flash at someone
             who is already signed in. -->
        <template v-if="auth.ready.value">
          <Separator class="my-2" />
          <template v-if="auth.user.value">
            <div
              class="flex items-center gap-3 px-3 py-2 text-xs text-muted-foreground"
            >
              <User class="size-[18px] shrink-0" />
              <span class="truncate">{{ auth.user.value.email }}</span>
            </div>
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-accent"
              @click="
                open = false;
                auth.signOut();
              "
            >
              <LogOut class="size-[18px] shrink-0" />
              Sign out
            </button>
          </template>
          <button
            v-else
            type="button"
            class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-accent"
            @click="
              open = false;
              auth.prompt();
            "
          >
            <LogIn class="size-[18px] shrink-0" />
            Sign in
          </button>
        </template>
      </div>
    </SheetContent>
  </Sheet>
</template>
