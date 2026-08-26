<script setup lang="ts">
/**
 * Light, dark, or follow the device.
 *
 * Three explicit choices rather than a two-state switch: "follow the device" is
 * the default and has to stay reachable, or a listener who taps light once at
 * noon has silently opted out of their phone's dark mode for good.
 *
 * `compact` mirrors AccountButton's, and for the same reason — the sidebar
 * gives a full-width row with a label, while on touch this rides in the saved
 * pages' header, where there is only room for the icon.
 */
import { Sun, Moon, Monitor } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme, type ThemeChoice } from '~/composables/useTheme';

const props = defineProps<{ compact?: boolean }>();

const theme = useTheme();

const OPTIONS: { value: ThemeChoice; label: string; icon: any }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

// The trigger shows what you are looking at, not what you picked: on "system"
// the useful thing to see is which way the device went.
const icon = computed(() => (theme.resolved.value ? Moon : Sun));

const trigger = computed(() =>
  props.compact
    ? 'size-8 text-muted-foreground'
    : 'w-full justify-start gap-3 px-3 text-sm font-normal text-muted-foreground'
);
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        :size="compact ? 'icon-sm' : undefined"
        :class="trigger"
        aria-label="Theme"
        title="Theme"
      >
        <component :is="icon" class="size-[18px] shrink-0" />
        <template v-if="!compact">Theme</template>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-40">
      <DropdownMenuRadioGroup
        :model-value="theme.choice.value"
        @update:model-value="theme.set($event as ThemeChoice)"
      >
        <DropdownMenuRadioItem
          v-for="option in OPTIONS"
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
