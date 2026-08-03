<script setup lang="ts">
/**
 * The on-screen Gurmukhi keyboard, as np-mono's shabad search has.
 *
 * It inserts GurbaniLipi keys — the ASCII codes the font draws as Gurmukhi —
 * so what it appends is the same thing the physical keyboard produces and the
 * same thing BaniDB's first-letter search expects. Its job is discovery: a
 * tagger who knows the line but not that ੜ lives on `V` can click it once and
 * learn where it is.
 *
 * The layout is np-mono's `keyboardData.kChar` verbatim, so the two apps train
 * the same muscle memory. Its alt layer is deliberately not ported: the key
 * that would reach it does not exist in np-mono's own base layout, so the layer
 * is unreachable there and copying it would invent behaviour rather than match
 * it.
 */
import { Keyboard } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';

const model = defineModel<string>({ required: true });

const BACKSPACE = '⇐';

// Blanks hold the grid's shape — the rows are laid out the way the letters
// group, so the last row is short and the gaps are part of the layout.
const KEYS: string[] = [
  'a',
  'A',
  'e',
  's',
  'h',
  'q',
  'Q',
  'd',
  'D',
  'n',
  'k',
  'K',
  'g',
  'G',
  '|',
  'p',
  'P',
  'b',
  'B',
  'm',
  'c',
  'C',
  'j',
  'J',
  '\\',
  'X',
  'r',
  'l',
  'v',
  'V',
  't',
  'T',
  'f',
  'F',
  'x',
  '',
  '',
  '',
  '',
  BACKSPACE,
];

const open = ref(false);
const root = useTemplateRef<HTMLElement>('root');

function press(key: string) {
  if (!key) return;
  if (key === BACKSPACE) {
    model.value = model.value.slice(0, -1);
    return;
  }
  model.value = `${model.value}${key}`;
}

// Clicking anywhere else puts it away. Registered only while open, so the page
// is not paying for a document listener the rest of the time.
onClickOutside(root, () => (open.value = false));
</script>

<template>
  <div ref="root" class="relative">
    <Button
      variant="ghost"
      size="icon-sm"
      class="size-7 text-muted-foreground"
      :aria-expanded="open"
      aria-label="On-screen Gurmukhi keyboard"
      title="On-screen Gurmukhi keyboard"
      @click="open = !open"
    >
      <Keyboard class="size-3.5" />
    </Button>

    <div
      v-if="open"
      class="absolute right-0 z-30 mt-1 w-72 rounded-md border border-border bg-popover p-2 shadow-md"
    >
      <div class="grid grid-cols-5 gap-1">
        <!-- A blank is a spacer, not a key: rendering it as a button would give
             the grid five dead targets. -->
        <span v-for="(key, i) in KEYS" :key="i">
          <Button
            v-if="key"
            variant="secondary"
            size="sm"
            class="w-full px-0"
            :class="key === BACKSPACE ? 'text-xs' : 'font-gurmukhi text-lg'"
            :aria-label="key === BACKSPACE ? 'Backspace' : `Type ${key}`"
            @click="press(key)"
          >
            {{ key }}
          </Button>
        </span>
      </div>
      <p class="mt-2 text-[11px] text-muted-foreground">
        Or just type — the same keys work on your keyboard.
      </p>
    </div>
  </div>
</template>
