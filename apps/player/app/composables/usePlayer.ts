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
  url: string;
  /** Set for a tagged segment; omitted to play the whole file. */
  startSec?: number;
  endSec?: number;
}

const current = ref<Playable | null>(null);
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
  }

  async function play(item: Playable) {
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
    await el.play();
    playing.value = true;
    setMediaSession(item);
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
      el.pause();
      playing.value = false;
      return;
    }
    if (!current.value.startSec) writeResume(current.value.id, el.currentTime);
  }

  function onLoadedMetadata() {
    // The crawl gives file size but never duration, so the browser is the only
    // source. Worth caching back to the DB later; for now it drives the scrubber.
    if (audio.value) duration.value = audio.value.duration;
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

  return {
    current, playing, currentTime, duration, progress,
    attach, play, toggle, seek, onTimeUpdate, onLoadedMetadata,
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
