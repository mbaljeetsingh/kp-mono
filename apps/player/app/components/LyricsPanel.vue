<script setup lang="ts">
import { usePlayer } from '~/composables/usePlayer';

const player = usePlayer();
const { shabad, loading, load } = useShabadText();
const open = defineModel<boolean>('open', { default: false });

/**
 * Filling a container, always.
 *
 * Both full players — the phone's sheet and the desktop's view — show the
 * read-along where the artwork was, which is where every music player puts
 * lyrics. This used to have a second frame as well, floating over the transport
 * bar with its own border, shadow and close button; #48 moved the read-along
 * into the desktop player and left nothing rendering it, so the frame, the
 * `inline` flag that chose between the two and the close button have gone. The
 * toggle that opened the view is what closes it.
 *
 * `open` stays a model even though both callers bind it as a static `true`: the
 * fetch watcher keys off it, and it is the panel's own record of whether it is
 * being shown.
 */

// Only tagged segments carry a shabad id — most will not, for a long time.
const shabadId = computed(() => player.current.value?.shabadId ?? null);
const mainVerseId = computed(() => player.current.value?.mainVerseId ?? null);

// `immediate` because the panel is no longer always mounted: the full-screen
// player creates it already open, and a watcher that only answers a *change*
// would then never fetch — the frame appeared with no shabad in it.
watch(
  [open, shabadId],
  () => {
    if (open.value) void load(shabadId.value);
  },
  { immediate: true }
);

const lines = computed(() => shabad.value?.verses ?? []);

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

// Always the whole shabad, with the sung line lit and scrolled to.
//
// An aligned rendition used to open on the sung line alone — a projector view,
// with the full text one caret away. It reads well and it was the wrong
// default: a shabad is a poem you follow, so the lines already sung and the
// ones coming are the context that makes the lit one mean anything, and a
// single centred line gives a reader no way to see where they are in it. The
// toggle went with it rather than becoming a preference nobody would find.

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
/** The scrolling box itself, so a scroll can be aimed at it and nothing else. */
const panelEl = useTemplateRef<HTMLElement>('panelEl');

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
  const line = anchorEl.value;
  const box = panelEl.value;
  if (!line || !box) return;
  // Scrolling this panel by hand rather than `scrollIntoView`, which walks up
  // and moves every scrollable ancestor it finds. Inside the desktop player
  // that reached the document itself and slid the entire app — sidebar,
  // transport and all — 173px up the window.
  const lineBox = line.getBoundingClientRect();
  const panelBox = box.getBoundingClientRect();
  box.scrollTo({
    top:
      box.scrollTop +
      (lineBox.top - panelBox.top) -
      (panelBox.height - lineBox.height) / 2,
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
    ref="panelEl"
    class="size-full overflow-y-auto overscroll-contain"
    @wheel.passive="onReaderScroll"
    @touchmove.passive="onReaderScroll"
  >
    <!-- No title and no writer/raag/ang line: this is opened from a tab that
         already says "Read along", above a heading that already names what is
         playing, so a header here was a third restatement holding the top of a
         small scrolling box. -->
    <div class="px-4 py-3">
      <p v-if="loading" class="py-8 text-center text-xs text-muted-foreground">
        Loading…
      </p>
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
