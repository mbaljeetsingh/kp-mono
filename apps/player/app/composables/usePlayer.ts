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
import type { Station } from '@kp/shared/types';
import { DEFAULT_STATION, stationById, stationPlayable } from '~/lib/stations';

/**
 * One sung line of a rendition, as the aligner wrote it into `line_timings`.
 *
 * `start`/`end` are absolute seconds into the file — the same clock as
 * `currentTime`, `startSec` and `endSec` — deliberately, so that re-cutting a
 * segment's boundaries does not invalidate an alignment that cost real work.
 *
 * Snake case because this is the jsonb payload verbatim, not a set of columns
 * `toPlayable` maps; remapping every element of every row would buy nothing.
 */
export interface LineTiming {
  verse_id: number;
  start: number;
  end: number;
}

export interface Playable {
  /** Stable track id — never the URL, which changes when SGPC reorganises. */
  id: string;
  title: string;
  subtitle?: string;
  /** Kept separate from `subtitle` so the player bar can link to the artist. */
  artist?: string;
  /** Storage filename for the artist's photo, when SGPC published one. */
  artistPhoto?: string | null;
  /** BaniDB ids, when the segment has been linked — drives read-along. */
  shabadId?: number | null;
  mainVerseId?: number | null;
  /**
   * Per-line timings, sorted by `start`, when this rendition has been aligned
   * — null for the rest, which is most of the archive. Sparse on purpose: a
   * gap between entries is alaap, instrumental or katha, where nothing is
   * being sung and so nothing should be highlighted.
   */
  lineTimings?: LineTiming[] | null;
  url: string;
  /** Set for a tagged segment; omitted to play the whole file. */
  startSec?: number;
  endSec?: number;
  /**
   * A broadcast rather than a recording. A flag rather than an id comparison
   * because there are forty stations now and every control that treats live
   * differently — no scrubber, no skip, no resume position, no play count —
   * has to key off something `toPlayable()` can never accidentally set.
   */
  isLive?: boolean;
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
/**
 * Ids whose stream would not start. A dark mount is the normal state for half
 * these gurdwaras at any hour, so it needs saying on the card rather than
 * leaving a tap that appears to do nothing.
 *
 * A set rather than one id: the listener works down the list trying stations,
 * and what they have already found to be off air should stay marked while they
 * try the next one. Each id clears only when that station is tried again.
 */
const failed = ref<Set<string>>(new Set());
/**
 * Id of the item currently being started, or null.
 *
 * "Buffering" cannot be inferred from `selected && !playing`: that is equally
 * true of a station the listener deliberately stopped, which left its card
 * reading "Connecting…" for as long as it stayed selected. Only an explicit
 * attempt sets this, and it is cleared however the attempt ends.
 */
const starting = ref<string | null>(null);

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
  /** A broadcast is what's loaded. Several controls key off this: a live
   *  feed has no timeline to scrub, no previous, and no end to advance past. */
  const isLive = computed(() => current.value?.isLive === true);

  /** Which station, for the Radio page's now-on-air marking and so the
   *  transport's play button rejoins the right feed. Derived rather than
   *  stored — `current` is already the single source of truth. */
  const currentStation = computed(() => stationById(current.value?.id));

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
        // Setting el.currentTime at readyState 0 fires no `timeupdate`, so
        // the reactive mirror would stay 0 until playback starts — and the
        // lyrics panel, which keys its highlight off it, would show no line
        // on a paused, restored rendition. Mirror it by hand.
        currentTime.value = el.currentTime;
        // Restored items dropped their timings at persist time; resuming via
        // the bar never goes through play(item), so fetch them here or a
        // reloaded session stays a static read-along until a list row is
        // clicked.
        refreshTimings(item);
      }
    }
  }

  function persistQueue() {
    if (import.meta.server) return;
    localStorage.setItem(
      QUEUE_KEY,
      JSON.stringify({
        // Timings are dropped, not carried: a persisted copy never refreshes,
        // so it would pin whatever the aligner had produced at queue time —
        // forever, across re-alignments. A restored queue falls back to the
        // static read-along until its rows are played from a live list again,
        // which is the pre-timings behavior, not a regression.
        items: queue.value.map(({ lineTimings, ...rest }) => rest),
        index: queueIndex.value,
      })
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

  /**
   * Empty Up next without touching what's playing — the same line
   * `removeFromQueue` draws at `queueIndex`. Truncating rather than emptying
   * also keeps the items behind the playhead, so `previous()` still works.
   *
   * Live is the exception, and it has to be: during the broadcast `current` is
   * LIVE while `queueIndex` still points into the listener's own queue (see
   * `toggleLive`). Truncating there would keep that item — invisible, because
   * `upNext` excludes it — and `attach()` would restore it as `current` on the
   * next page load. Clearing during live has to mean the whole queue goes.
   */
  function clearUpNext() {
    if (isLive.value) {
      queue.value = [];
      queueIndex.value = -1;
    } else {
      if (queueIndex.value < 0) return;
      queue.value = queue.value.slice(0, queueIndex.value + 1);
    }
    persistQueue();
  }

  async function next() {
    // A dropped live connection fires `ended`. Since switching to the
    // broadcast keeps the listener's queue, without this a stream hiccup would
    // start playing whatever they had lined up, unprompted.
    if (isLive.value) {
      audio.value?.pause();
      playing.value = false;
      return;
    }
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

    // Always adopt the incoming row, even when it is the same rendition: a
    // list row fetched after alignment carries lineTimings the held copy may
    // lack (a restored queue drops them on purpose). Only the ELEMENT setup
    // below is guarded — re-pointing src/currentTime on a same-track click
    // would needlessly restart playback.
    const sameTrack = current.value?.id === item.id && el.src === item.url;
    current.value = item;
    if (!sameTrack) {
      el.src = item.url;
      // A segment starts at its own offset; a whole track resumes where the
      // listener left off — at 70-minute lengths that is essential, not polish.
      // A broadcast has no position to restore and is not seekable anyway.
      if (!item.isLive) {
        const resume = readResume()[item.id];
        el.currentTime = item.startSec ?? resume ?? 0;
      }
      // Mirror immediately: the ref otherwise holds the PREVIOUS file's
      // position until the first `timeupdate` (~250ms). Timings are absolute
      // seconds into the file, so that stale value can land inside the new
      // item's timings and flash-highlight an arbitrary line.
      currentTime.value = el.currentTime;
    }
    // Before the await: `useSupabaseClient` reads runtime config, and the Nuxt
    // instance context is gone once execution resumes after an await.
    registerPlay(item);
    refreshTimings(item);
    starting.value = item.id;
    try {
      await el.play();
      playing.value = true;
      setMediaSession(item);
    } catch {
      // Clicking a second row while the first is still starting aborts the
      // pending play(). Swallow it, but keep the flag honest rather than
      // leaving a Pause icon over silent audio.
      playing.value = !el.paused;
    } finally {
      // However it ended — playing, aborted, or rejected because the mount is
      // dark — this attempt is over. Only clear it if a later attempt has not
      // already claimed the slot, or a fast failure would erase the newer
      // station's "Connecting…".
      if (starting.value === item.id) starting.value = null;
    }
  }

  /**
   * Start or stop a broadcast — what every Live and Radio control calls.
   * Defaults to Harimandir Sahib, which is what the sidebar and the tab bar
   * start when the listener has not picked a station.
   *
   * Deliberately `play(item, false)`: the queue belongs to the listener, and
   * dropping into live for a few minutes should not throw away what they had
   * lined up. It stays in Up next, ready for when they come back.
   */
  async function toggleLive(station: Station = DEFAULT_STATION) {
    const el = audio.value;
    const item = stationPlayable(station);
    // Only the station already on air stops on a second press. Pressing a
    // different one while this is playing switches over, which is what a list
    // of forty stations has to do.
    if (current.value?.id === item.id && playing.value) {
      el?.pause();
      playing.value = false;
      // Stopping is not buffering. Without this the card the listener just
      // stopped goes on reading "Connecting…" for as long as it stays selected.
      starting.value = null;
      return;
    }
    // Only this station's mark clears: an encoder that was off a minute ago
    // may not be, but that says nothing about the others.
    failed.value.delete(item.id);
    // Rejoin at the live edge instead of resuming. Chrome keeps buffering a
    // paused stream, so a plain play() picks up exactly where it stopped —
    // measured at a full 60 seconds behind after a 60-second pause, under a
    // badge that claims Live. `load()` reconnects; it costs one `emptied`
    // event and no error.
    //
    // Only needed when the src is unchanged: switching stations assigns a new
    // src, and that resets the element on its own.
    if (el && el.src === item.url) el.load();
    await play(item, false);
  }

  function toggle() {
    const el = audio.value;
    if (!el || !current.value) return;
    // The transport button and the lock-screen controls both land here, and
    // for the broadcast "resume" is the wrong verb — it would pick the buffer
    // up where it stopped rather than rejoining. Same path as the Live button.
    if (isLive.value) {
      void toggleLive(currentStation.value ?? DEFAULT_STATION);
      return;
    }
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
    // at its own offset, and a live stream has no meaningful position at all
    // — writing one made a later "listen live" seek to a stale timestamp.
    if (current.value.startSec === undefined && !current.value.isLive) {
      writeResume(current.value.id, el.currentTime);
    }
  }

  /**
   * A live feed can drop mid-listen. Without this the transport would sit
   * showing Pause over silence, which reads as the app being broken.
   *
   * Recording the id as well, because for radio this is the ordinary case, not
   * a fault: a gurdwara's encoder is off between programmes, and roughly a
   * quarter of these mounts return 404 at any given hour. The Radio page marks
   * that station unavailable rather than leaving a tap that appears to do
   * nothing.
   */
  function onError() {
    playing.value = false;
    starting.value = null;
    // Only broadcasts. An archive track that fails is a genuine fault worth
    // nothing here, and adding its segment uuid to a set only the Radio page
    // reads would grow the set for the life of the session with ids nothing
    // can match.
    if (current.value?.isLive) failed.value.add(current.value.id);
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
   * them edit tags. A broadcast has no segment row and is skipped.
   */
  /** A held Playable can predate its alignment — a restored queue (which
   *  drops timings on purpose) or a row fetched before the nightly run.
   *  Timings are one cheap read away, so fetch them at play time instead of
   *  waiting for the next list load. Fire-and-forget, same raw-REST shape as
   *  registerPlay, and patched in only if this item is still what's playing —
   *  a failure costs nothing but the static panel we already had. */
  function refreshTimings(item: Playable) {
    if (import.meta.server || item.isLive) return;
    if (item.shabadId == null || item.lineTimings?.length) return;
    const { supabaseUrl, supabaseKey } = useRuntimeConfig().public;
    void fetch(
      `${supabaseUrl}/rest/v1/shabads?id=eq.${item.id}&select=line_timings`,
      { headers: { apikey: supabaseKey as string } }
    )
      .then((r) => r.json())
      .then((rows) => {
        const timings = rows?.[0]?.line_timings;
        if (!Array.isArray(timings) || !timings.length) return;
        if (current.value?.id !== item.id) return;
        current.value = { ...current.value, lineTimings: timings };
        const qi = queue.value.findIndex((x) => x.id === item.id);
        if (qi >= 0)
          queue.value[qi] = { ...queue.value[qi]!, lineTimings: timings };
      })
      .catch(() => {});
  }

  function registerPlay(item: Playable) {
    if (import.meta.server || item.isLive) return;
    const id = item.id;
    const { supabaseUrl, supabaseKey } = useRuntimeConfig().public;
    void fetch(`${supabaseUrl}/rest/v1/rpc/register_play`, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: supabaseKey as string,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rendition: id }),
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
    isLive,
    currentStation,
    toggleLive,
    failed,
    starting,
    queue,
    upNext,
    playList,
    playFromQueue,
    addToQueue,
    playNextInQueue,
    removeFromQueue,
    clearUpNext,
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
    onError,
  };
}

/**
 * A row from the `shabads` view — or from anything built on it, like
 * `playlist_shabads` — as something this player can play. Lives here because
 * rows, row menus, playlists and favorites all need the identical mapping.
 */
export function toPlayable(s: any): Playable {
  return {
    id: s.id,
    title: s.name,
    subtitle: s.artist_display ?? s.artist ?? undefined,
    artist: s.artist ?? undefined,
    artistPhoto: s.artist_photo ?? null,
    shabadId: s.shabad_id ?? null,
    mainVerseId: s.main_verse_id ?? null,
    // An array or nothing. The guard covers null, a view that predates the
    // column, and a payload that came back as a string, in one test — which is
    // also the test the panel uses to decide whether this rendition is aligned.
    lineTimings: Array.isArray(s.line_timings) ? s.line_timings : null,
    url: s.url,
    startSec: Number(s.start_sec),
    endSec: Number(s.end_sec),
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
