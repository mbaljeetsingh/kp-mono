/**
 * Playback transport built for tagging, not for listening.
 *
 * The native `<audio controls>` element cannot do the things this task needs:
 * hunting a shabad boundary in a 70-minute set means skipping in fixed steps,
 * slowing down to place the cut, and looping a few seconds to check it. Doing
 * that with a browser's default slider is slow enough to cap how much anyone
 * tags in one sitting.
 *
 * Seeking is free — sgpc.net honours Range requests — so every jump here costs
 * nothing beyond the bytes actually played.
 */
import { ref, computed, onUnmounted } from 'vue';

// The shortest segment the workbench will create. One definition: the drag
// handles in TagPlayer clamp with it and BoundaryControl's min/max derive from
// it — two copies would let a drag place a boundary the nudges refuse.
export const MIN_LENGTH = 0.1;

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export function useTagPlayer() {
  const el = ref<HTMLAudioElement | null>(null);
  const playing = ref(false);
  const currentTime = ref(0);
  const duration = ref(0);
  const speed = ref(1);

  /** When set, playback loops this window — used to audition a boundary. */
  const loop = ref<{ start: number; end: number } | null>(null);

  function attach(node: HTMLAudioElement) {
    el.value = node;
    node.playbackRate = speed.value;
  }

  function toggle() {
    const a = el.value;
    if (!a) return;
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
    playing.value = !a.paused;
  }

  function seek(to: number) {
    const a = el.value;
    if (!a) return;
    // Clamping matters at both ends: seeking past duration leaves some browsers
    // stalled rather than at the end, and a negative time throws.
    a.currentTime = Math.min(Math.max(0, to), duration.value || Infinity);
    currentTime.value = a.currentTime;
  }

  /** Negative skips back. 10s and 30s are the useful steps when hunting. */
  const skip = (seconds: number) =>
    seek((el.value?.currentTime ?? 0) + seconds);

  /** Fine adjustment for placing a cut without re-marking it. */
  const nudge = (seconds: number) => skip(seconds);

  function setSpeed(rate: number) {
    speed.value = rate;
    if (el.value) el.value.playbackRate = rate;
  }

  function cycleSpeed(direction: 1 | -1) {
    const i = SPEEDS.indexOf(speed.value as (typeof SPEEDS)[number]);
    const next =
      SPEEDS[Math.min(Math.max(0, i + direction), SPEEDS.length - 1)];
    if (next) setSpeed(next);
  }

  function onTimeUpdate() {
    const a = el.value;
    if (!a) return;
    currentTime.value = a.currentTime;
    // Auditioning a boundary: jump back to the window's start rather than
    // letting playback run on into the next shabad.
    if (loop.value && a.currentTime >= loop.value.end) {
      a.currentTime = loop.value.start;
    }
  }

  function onLoadedMetadata() {
    if (el.value) duration.value = el.value.duration;
  }

  function playFrom(seconds: number) {
    seek(seconds);
    void el.value?.play().catch(() => {});
    playing.value = true;
  }

  /** Loop the last few seconds before a cut and the first few after it — the
   *  only way to tell whether a boundary actually falls in the gap. */
  function auditionBoundary(at: number, pad = 4) {
    loop.value = { start: Math.max(0, at - pad), end: at + pad };
    playFrom(loop.value.start);
  }

  function stopLoop() {
    loop.value = null;
  }

  const progress = computed(() =>
    duration.value ? (currentTime.value / duration.value) * 100 : 0
  );

  onUnmounted(() => el.value?.pause());

  return {
    el,
    playing,
    currentTime,
    duration,
    speed,
    loop,
    progress,
    attach,
    toggle,
    seek,
    skip,
    nudge,
    setSpeed,
    cycleSpeed,
    playFrom,
    auditionBoundary,
    stopLoop,
    onTimeUpdate,
    onLoadedMetadata,
  };
}

export function fmt(v: number | null, withTenths = false): string {
  if (v === null || !Number.isFinite(v)) return '—';
  const m = Math.floor(v / 60);
  const s = Math.floor(v % 60);
  const base = `${m}:${String(s).padStart(2, '0')}`;
  // Tenths only where precision is being set, so the readout stays scannable
  // everywhere else.
  return withTenths ? `${base}.${Math.floor((v % 1) * 10)}` : base;
}
