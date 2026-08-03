<script setup lang="ts">
import { X, BookOpen, ChevronsUpDown, ChevronsDownUp } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { usePlayer } from '~/composables/usePlayer';

const player = usePlayer();
const { shabad, loading, load } = useShabadText();
const open = defineModel<boolean>('open', { default: false });

// Only tagged segments carry a shabad id — most will not, for a long time.
const shabadId = computed(() => player.current.value?.shabadId ?? null);
const mainVerseId = computed(() => player.current.value?.mainVerseId ?? null);

watch([open, shabadId], () => {
  if (open.value) void load(shabadId.value);
});

const lines = computed(() => shabad.value?.verses ?? []);

// Which shabad this is — writer, raag and ang. It comes back on the same
// fetch as the verses, and without it the panel shows Gurbani without saying
// what was linked, which is the one thing a listener would check it against.
const info = computed(() => {
  const i = shabad.value?.shabadInfo;
  if (!i) return '';
  return [
    i.writer?.english,
    i.raag?.english,
    i.pageNo ? `Ang ${i.pageNo}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
});

// Which line is being sung right now, for an aligned rendition. The timings
// are sparse by design, so falling between two of them — alaap, instrumental,
// katha — is not a miss to paper over: nothing is being sung, and nothing
// should be lit. `find` over fewer than sixty entries is cheap enough to run
// on every `timeupdate`; the array itself is only re-read when the track does.
const timings = computed(() => player.current.value?.lineTimings ?? null);

const singingVerseId = computed(() => {
  const at = player.currentTime.value;
  return (
    timings.value?.find((l) => at >= l.start && at < l.end)?.verse_id ?? null
  );
});

// Aligned renditions follow the singing; everything else — most of the archive
// — keeps holding the one line the tagger pinned, exactly as before.
const highlightId = computed(() =>
  timings.value?.length ? singingVerseId.value : mainVerseId.value
);

// One line, or the whole shabad. An aligned rendition defaults to the single
// sung line — the projector view, all signal — with the full text one caret
// away. Unaligned renditions have nothing to follow, so they are always the
// full shabad and get no toggle. Collapses again on track change: the mode is
// a property of listening-along, not a sticky preference.
const expanded = ref(false);
watch(
  () => player.current.value?.id,
  () => {
    expanded.value = false;
  }
);
const followMode = computed(() => !!timings.value?.length && !expanded.value);

// What the one-line view shows during a gap: the line that was just sung,
// dimmed, rather than a blank — alaap between lines would otherwise blink the
// panel empty and back several times a minute.
const lastSungId = ref<number | null>(null);
watch(singingVerseId, (v) => {
  if (v != null) lastSungId.value = v;
});
watch(
  () => player.current.value?.id,
  () => {
    lastSungId.value = null;
  }
);
const focusVerse = computed(() => {
  const id = singingVerseId.value ?? lastSungId.value;
  return id == null
    ? null
    : (lines.value.find((v: any) => v.verseId === id) ?? null);
});

// Where the scroll goes. Falls back to the tagger's anchor when nothing is
// being sung right now: opening the panel mid-alaap on an aligned rendition
// must still position the reader at the refrain (the old behavior for every
// rendition), not leave them at the top of the shabad — and when the first
// line then lands, the smooth scroll travels from the refrain's neighborhood
// instead of crawling the whole shabad. The VISUAL highlight stays
// `highlightId` alone; a gap still lights nothing.
const anchorId = computed(() => highlightId.value ?? mainVerseId.value);

// A shabad runs well past the height of this panel, so the highlighted line is
// usually below the fold on open. Scroll to it rather than making the reader
// hunt for the line the rendition is actually on.
const anchorEl = ref<HTMLElement | null>(null);

// Written through a setter so the template's `:ref` and the clear below agree,
// and so clearing it does not narrow the ref to `null` for the read after the
// await — the render in between is exactly what puts an element back.
function setAnchor(el: HTMLElement | null) {
  anchorEl.value = el;
}

// The panel is the reader's once they scroll it: a listener who scrolled down
// to read a later translation must not be yanked back to the sung line every
// time the singing advances. Wheel and touch mark reader intent (`scroll`
// would also fire for our own scrollIntoView); follow-along resumes after a
// pause, or immediately on reopen.
const READER_HOLD_MS = 8000;
let readerScrolledAt = 0;
function onReaderScroll() {
  readerScrolledAt = Date.now();
}

async function scrollToHighlight(smooth: boolean) {
  if (!open.value || anchorId.value == null) return;
  if (smooth && Date.now() - readerScrolledAt < READER_HOLD_MS) return;
  // Drop the old element first: a timing can name a verse this shabad's text
  // does not contain, and no ref callback would then match to overwrite it.
  setAnchor(null);
  // The cached path fills `lines` on a microtask, so wait for the render that
  // creates the element before reaching for it.
  await nextTick();
  anchorEl.value?.scrollIntoView({
    block: 'center',
    behavior: smooth ? 'smooth' : 'auto',
  });
}

watch([lines, open], () => {
  // A fresh open is a request for positioning — any earlier reading pause is
  // over by definition.
  readerScrolledAt = 0;
  void scrollToHighlight(false);
});

// Once per line, not once per tick — `highlightId` only changes when the
// singing moves on. Smooth here and not on open, where the same animation
// would crawl the whole length of the shabad.
watch(highlightId, () => void scrollToHighlight(true));
</script>

<template>
  <aside
    v-if="open"
    class="absolute right-4 bottom-full left-4 mb-2 max-h-[28rem] overflow-y-auto rounded-lg border border-border bg-card shadow-2xl md:left-auto md:w-96"
    @wheel.passive="onReaderScroll"
    @touchmove.passive="onReaderScroll"
  >
    <div
      class="sticky top-0 flex items-start justify-between gap-2 border-b border-border bg-card px-4 py-3"
    >
      <div class="min-w-0">
        <p
          class="flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          <BookOpen class="size-4 shrink-0" /> Shabad
        </p>
        <p v-if="info" class="truncate text-xs text-muted-foreground">
          {{ info }}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <!-- Only aligned renditions can follow the singing, so only they get
             the one-line/full-shabad toggle. -->
        <Button
          v-if="timings?.length"
          variant="ghost"
          size="icon-sm"
          class="size-7 text-muted-foreground"
          :title="
            followMode ? 'Show the full shabad' : 'Show the sung line only'
          "
          @click="expanded = !expanded"
        >
          <ChevronsUpDown v-if="followMode" class="size-4" />
          <ChevronsDownUp v-else class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          class="size-7 text-muted-foreground"
          @click="open = false"
        >
          <X class="size-4" />
        </Button>
      </div>
    </div>

    <div class="px-4 py-3">
      <p v-if="loading" class="py-8 text-center text-xs text-muted-foreground">
        Loading…
      </p>
      <div v-else-if="followMode" class="py-4">
        <!-- The projector view: just the sung line, dimming through gaps
             rather than vanishing — alaap is a pause, not a blank screen. -->
        <template v-if="focusVerse">
          <div
            class="transition-opacity duration-500"
            :class="singingVerseId == null && 'opacity-40'"
          >
            <p class="text-center text-xl leading-loose text-primary">
              {{ focusVerse.verse?.unicode ?? focusVerse.verse?.gurmukhi }}
            </p>
            <p class="mt-1 text-center text-sm text-primary/70">
              {{ focusVerse.transliteration?.english }}
            </p>
            <p
              v-if="focusVerse.translation?.en?.bdb"
              class="mt-2 text-center text-xs text-muted-foreground"
            >
              {{ focusVerse.translation.en.bdb }}
            </p>
          </div>
        </template>
        <p v-else class="py-4 text-center text-xs text-muted-foreground">
          Waiting for the singing to begin…
        </p>
      </div>
      <template v-else>
        <!-- The line is marked the same way the tagger saw the anchor in admin
             — a warm wash and a rule down the side. On an aligned rendition
             that mark walks down the shabad with the singing, so it fades
             rather than jumping; between two timings it is on no line at all,
             which is the point of a gap and not a missing highlight. -->
        <p
          v-for="v in lines"
          :key="v.verseId"
          :ref="
            (el) => {
              if (v.verseId === anchorId) setAnchor(el as HTMLElement);
            }
          "
          class="border-b border-border/60 py-2 transition-colors last:border-0"
          :class="
            v.verseId === highlightId &&
            '-mx-2 rounded-r border-l-2 border-l-primary bg-primary/10 px-2'
          "
        >
          <span
            class="block text-[15px] leading-relaxed"
            :class="
              v.verseId === highlightId ? 'text-primary' : 'text-foreground'
            "
          >
            {{ v.verse?.unicode ?? v.verse?.gurmukhi }}
          </span>
          <span
            class="mt-0.5 block text-xs"
            :class="
              v.verseId === highlightId
                ? 'text-primary/70'
                : 'text-muted-foreground'
            "
          >
            {{ v.transliteration?.english }}
          </span>
          <span
            v-if="v.translation?.en?.bdb"
            class="mt-0.5 block text-xs text-muted-foreground"
          >
            {{ v.translation.en.bdb }}
          </span>
        </p>
      </template>
    </div>
  </aside>
</template>
