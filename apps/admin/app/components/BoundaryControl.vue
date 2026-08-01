<script setup lang="ts">
/**
 * One segment boundary: set it from the playhead, then walk it into place.
 *
 * Re-marking from the playhead is a poor way to move a cut by a hair — it
 * means seeking, playing and catching the moment again. Nudging edits the
 * number the tagger already has, which is the difference between placing a
 * boundary once and placing it four times.
 */
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { fmt } from '~/composables/useTagPlayer';

const props = defineProps<{
  label: string;
  /** Bounds in seconds. Null means unbounded on that side. */
  min?: number | null;
  max?: number | null;
}>();

const value = defineModel<number | null>({ required: true });
const emit = defineEmits<{ mark: [] }>();

// 0.1s is the transport's fine step (shift+arrow) and the finest the readout
// renders, so a nudge always shows up in the number. 1s covers the case where
// the cut landed in the wrong phrase rather than a hair out.
const COARSE = 1;
const FINE = 0.1;

function nudge(delta: number) {
  if (value.value === null) return;
  // Two decimals matches what save() writes, so repeated nudges cannot drift
  // into 12.299999999.
  let next = Math.round((value.value + delta) * 100) / 100;
  if (props.min != null) next = Math.max(props.min, next);
  if (props.max != null) next = Math.min(props.max, next);
  value.value = next;
}

function atLimit(step: number) {
  if (value.value === null) return true;
  if (step < 0 && props.min != null) return value.value <= props.min;
  if (step > 0 && props.max != null) return value.value >= props.max;
  return false;
}

const STEPS = [-COARSE, -FINE, FINE, COARSE] as const;
const stepLabel = (s: number) => (s > 0 ? `+${s}` : `${s}`);
</script>

<template>
  <ButtonGroup :aria-label="`${label} boundary`">
    <Button
      v-for="s in STEPS.slice(0, 2)"
      :key="s"
      variant="outline"
      size="sm"
      class="px-2 text-[11px] tabular-nums text-muted-foreground"
      :disabled="atLimit(s)"
      :title="`${label} ${stepLabel(s)}s`"
      @click="nudge(s)"
    >
      {{ stepLabel(s) }}
    </Button>

    <Button
      variant="outline"
      size="sm"
      :title="`Set ${label.toLowerCase()} to the playhead`"
      @click="emit('mark')"
    >
      {{ label }} ·
      <span class="tabular-nums">{{ fmt(value, true) }}</span>
    </Button>

    <Button
      v-for="s in STEPS.slice(2)"
      :key="s"
      variant="outline"
      size="sm"
      class="px-2 text-[11px] tabular-nums text-muted-foreground"
      :disabled="atLimit(s)"
      :title="`${label} ${stepLabel(s)}s`"
      @click="nudge(s)"
    >
      {{ stepLabel(s) }}
    </Button>
  </ButtonGroup>
</template>
