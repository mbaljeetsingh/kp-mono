/**
 * Global playback state.
 *
 * Module-level refs rather than a store: there is exactly one <audio> element
 * for the whole app (mounted in app.vue), so every page shares this instance.
 *
 * Segments are the reason `startSec`/`endSec` exist here. A tagged shabad is
 * not a file — it is a byte range of one, and sgpc.net serves `206` with
 * `accept-ranges: bytes`, so seeking into a 70-minute set costs nothing and
 * downloads nothing extra.
 */
import { ref, computed } from 'vue';

export interface Playable {
  /** Stable track id — never the URL, which changes when SGPC reorganises. */
  id: string;
  title: string;
  subtitle?: string;
  /** Kept separate from `subtitle` so the player bar can link to the artist. */
  artist?: string;
  /** BaniDB ids, when the segment has been linked — drives read-along. */
  shabadId?: number | null;
  mainVerseId?: number | null;
  url: string;
  /** Set for a tagged segment; omitted to play the whole file. */
  startSec?: number;
  endSec?: number;
}

const QUEUE_KEY = 'kp:queue';

function readQueue(): { items: Playable[]; index: number } {
  if (import.meta.server) return { items: [], index: -1 };
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? 'null');
    return raw?.items ? raw : { items: [], index: -1 };
  } catch {
    return { items: [], index: -1 };
  }
}

const current = ref<Playable | null>(null);
/** Up next. A shabad is short, so a queue is what makes this a music player
 *  rather than a file opener — one tap on a list plays it and lines up the rest. */
const queue = ref<Playable[]>([]);
const queueIndex = ref(-1);
const playing = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const audio = ref<HTMLAudioElement | null>(null);

/** Resume positions, keyed by stable id so they survive a URL change and
 *  migrate cleanly into an account if auth lands later. */
const RESUME_KEY = 'kp:resume';

function readResume(): Record<string, number> {
  if (import.meta.server) return {};
  try {
    return JSON.parse(localStorage.getItem(RESUME_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeResume(id: string, seconds: number) {
  if (import.meta.server) return;
  const all = readResume();
  // Don't remember near-start or near-end positions — resuming a track the
  // listener effectively finished is worse than starting it over.
  if (seconds < 30 || (duration.value && seconds > duration.value - 30)) {
    delete all[id];
  } else {
    all[id] = Math.floor(seconds);
  }
  localStorage.setItem(RESUME_KEY, JSON.stringify(all));
}

export function usePlayer() {
  function attach(el: HTMLAudioElement) {
    audio.value = el;
    // Restore the queue but never auto-play: browsers block unprompted audio,
    // and resuming sound on page load is hostile anyway.
    const saved = readQueue();
    if (saved.items.length && !queue.value.length) {
      queue.value = saved.items;
      queueIndex.value = saved.index;
      const item = saved.items[saved.index];
      if (item) {
        current.value = item;
        el.src = item.url;
        el.currentTime = item.startSec ?? readResume()[item.id] ?? 0;
      }
    }
  }

  function persistQueue() {
    if (import.meta.server) return;
    localStorage.setItem(
      QUEUE_KEY,
      JSON.stringify({ items: queue.value, index: queueIndex.value })
    );
  }

  /** Jump straight to an item already in the queue — what clicking a row in
   *  the Up next panel should do, and previously did nothing at all. */
  async function playFromQueue(id: string) {
    const i = queue.value.findIndex((q) => q.id === id);
    if (i < 0) return;
    queueIndex.value = i;
    await play(queue.value[i]!, false);
  }

  /** Play one item and queue the rest of the list it came from. */
  async function playList(items: Playable[], startAt = 0) {
    queue.value = items;
    queueIndex.value = startAt;
    persistQueue();
    await play(items[startAt]!, false);
  }

  /**
   * Append to the end of the queue. Nothing starts playing — this is the
   * "I'll listen to that after this" action, which had no UI at all before.
   */
  function addToQueue(item: Playable) {
    if (queue.value.some((q) => q.id === item.id)) return;
    queue.value = [...queue.value, item];
    // Playing nothing yet: queueing is enough to make the transport usable.
    if (queueIndex.value < 0) queueIndex.value = 0;
    persistQueue();
  }

  /** Insert directly after the current item rather than at the end. */
  function playNextInQueue(item: Playable) {
    const rest = queue.value.filter((q) => q.id !== item.id);
    const at = Math.max(queueIndex.value, 0);
    queue.value = [...rest.slice(0, at + 1), item, ...rest.slice(at + 1)];
    persistQueue();
  }

  function removeFromQueue(id: string) {
    const i = queue.value.findIndex((q) => q.id === id);
    if (i < 0 || i <= queueIndex.value) return;
    queue.value = queue.value.filter((q) => q.id !== id);
    persistQueue();
  }

  async function next() {
    // Nothing queued after this one: stop. Returning silently would leave the
    // element playing straight past the segment's end into the rest of a
    // 70-minute file — which is the *default* case, since a single shabad
    // played from search or favorites has no follower.
    if (queueIndex.value < 0 || queueIndex.value >= queue.value.length - 1) {
      audio.value?.pause();
      playing.value = false;
      return;
    }
    queueIndex.value += 1;
    persistQueue();
    await play(queue.value[queueIndex.value]!, false);
  }

  async function previous() {
    // Restart the current item first, the way every music player does, and only
    // step back if the listener hits it again near the start.
    //
    // Measured from the segment's own start, not the file's: a segment
    // beginning at 12:00 into a set would otherwise always read as ">3s in",
    // making the step-back branch unreachable.
    const intoSegment =
      (audio.value?.currentTime ?? 0) - (current.value?.startSec ?? 0);
    if (intoSegment > 3) {
      seek(current.value?.startSec ?? 0);
      return;
    }
    if (queueIndex.value <= 0) return;
    queueIndex.value -= 1;
    persistQueue();
    await play(queue.value[queueIndex.value]!, false);
  }

  async function play(item: Playable, clearQueue = true) {
    if (clearQueue) {
      queue.value = [item];
      queueIndex.value = 0;
    }
    const el = audio.value;
    if (!el) return;

    if (current.value?.id !== item.id || el.src !== item.url) {
      current.value = item;
      el.src = item.url;
      // A segment starts at its own offset; a whole track resumes where the
      // listener left off — at 70-minute lengths that is essential, not polish.
      const resume = readResume()[item.id];
      el.currentTime = item.startSec ?? resume ?? 0;
    }
    // Before the await: `useSupabaseClient` reads runtime config, and the Nuxt
    // instance context is gone once execution resumes after an await.
    registerPlay(item.id);
    try {
      await el.play();
      playing.value = true;
      setMediaSession(item);
    } catch {
      // Clicking a second row while the first is still starting aborts the
      // pending play(). Swallow it, but keep the flag honest rather than
      // leaving a Pause icon over silent audio.
      playing.value = !el.paused;
    }
  }

  function toggle() {
    const el = audio.value;
    if (!el || !current.value) return;
    if (el.paused) {
      el.play();
      playing.value = true;
    } else {
      el.pause();
      playing.value = false;
    }
  }

  function seek(seconds: number) {
    if (audio.value) audio.value.currentTime = seconds;
  }

  function onTimeUpdate() {
    const el = audio.value;
    if (!el || !current.value) return;
    currentTime.value = el.currentTime;

    // A segment is a window over a longer file — stop at its end rather than
    // running on into the next shabad.
    const end = current.value.endSec;
    if (end && el.currentTime >= end) {
      // A segment is a window over a longer file, so its end is not the file's
      // end — advance the queue here rather than waiting for an `ended` event
      // that would only fire an hour later.
      void next();
      return;
    }
    // Only whole-file playback has a resume position. A segment always starts
    // at its own offset, and the live stream has no meaningful position at all
    // — writing one made a later "listen live" seek to a stale timestamp.
    if (current.value.startSec === undefined && current.value.id !== 'live') {
      writeResume(current.value.id, el.currentTime);
    }
  }

  function onLoadedMetadata() {
    // The crawl gives file size but never duration, so the browser is the only
    // source. Worth caching back to the DB later; for now it drives the scrubber.
    if (audio.value) duration.value = audio.value.duration;
  }

  /**
   * Count the play, for the Popular shelf.
   *
   * Sent as a plain keepalive fetch rather than through the Supabase client:
   * this is fire-and-forget, and an unawaited client promise gets aborted
   * mid-flight (observed as ERR_ABORTED, with the count never incrementing).
   * `keepalive` is exactly the guarantee a ping wants — the browser completes
   * it even if the page navigates away.
   *
   * The endpoint is a security-definer function, so an anonymous listener can
   * register a play without holding UPDATE on segments, which would also let
   * them edit tags. The live stream has no segment row and is skipped.
   */
  function registerPlay(id: string) {
    if (import.meta.server || id === 'live') return;
    const { supabaseUrl, supabaseKey } = useRuntimeConfig().public;
    void fetch(`${supabaseUrl}/rest/v1/rpc/register_play`, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: supabaseKey as string,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ segment: id }),
    }).catch(() => {
      // A missed play count is not worth surfacing to a listener.
    });
  }

  /** Lock screen, Bluetooth and car controls — cheap, and it is most of what
   *  makes this feel like an app rather than a web page. */
  function setMediaSession(item: Playable) {
    if (import.meta.server || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.title,
      artist: item.subtitle ?? 'Sri Harmandir Sahib',
      album: 'Kirtan',
    });
    navigator.mediaSession.setActionHandler('play', () => toggle());
    navigator.mediaSession.setActionHandler('pause', () => toggle());
  }

  /** Position within the current segment, or within the file if untagged. */
  const progress = computed(() => {
    const start = current.value?.startSec ?? 0;
    const end = current.value?.endSec ?? duration.value;
    if (!end || end <= start) return 0;
    return ((currentTime.value - start) / (end - start)) * 100;
  });

  const upNext = computed(() =>
    queueIndex.value < 0 ? [] : queue.value.slice(queueIndex.value + 1)
  );

  return {
    current,
    queue,
    upNext,
    playList,
    playFromQueue,
    addToQueue,
    playNextInQueue,
    removeFromQueue,
    next,
    previous,
    playing,
    currentTime,
    duration,
    progress,
    attach,
    play,
    toggle,
    seek,
    onTimeUpdate,
    onLoadedMetadata,
  };
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}
