<script setup lang="ts">
/**
 * Light, dark, or follow the device.
 *
 * Three explicit choices rather than a two-state switch: "follow the device" is
 * the default and has to stay reachable, or a listener who taps light once at
 * noon has silently opted out of their phone's dark mode for good.
 *
 * The trigger names the choice — "System", not the palette that choice happened
 * to resolve to. It read the other way round at first, on the theory that what
 * you can see is the useful thing to show; but the control's whole job is the
 * third state, and a sun on a light-by-daylight "System" is indistinguishable
 * from a sun on a pinned "Light". Naming the choice is also the only way to
 * tell, without opening the menu, that you are still following the device.
 *
 * Desktop only, in practice: the sidebar is the one place it renders. The phone
 * lists the same three choices flat inside MobileTabBar's More sheet, where a
 * dropdown over a sheet would be an overlay too many.
 */
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useTheme,
  THEME_OPTIONS,
  type ThemeChoice,
} from '~/composables/useTheme';

const theme = useTheme();

const current = computed(() =>
  THEME_OPTIONS.find((o) => o.value === theme.choice.value)!
);
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        class="w-full justify-start gap-3 px-3 text-sm font-normal text-muted-foreground"
        :aria-label="`Theme: ${current.label}`"
        :title="`Theme: ${current.label}`"
      >
        <component :is="current.icon" class="size-[18px] shrink-0" />
        {{ current.label }}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-40">
      <DropdownMenuRadioGroup
        :model-value="theme.choice.value"
        @update:model-value="theme.set($event as ThemeChoice)"
      >
        <DropdownMenuRadioItem
          v-for="option in THEME_OPTIONS"
          :key="option.value"
          :value="option.value"
        >
          <component :is="option.icon" class="size-4" />
          {{ option.label }}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
