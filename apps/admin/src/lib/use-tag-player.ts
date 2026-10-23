/**
 * Playback built for tagging, not for listening.
 *
 * A browser's default transport cannot do what this task needs: hunting a
 * shabad boundary in a 70-minute set means skipping in fixed steps, slowing
 * down to place the cut, and jumping straight to a cut to check it by ear.
 * Doing that with play/pause and a scrubber is slow enough to cap how much
 * anyone tags in one sitting.
 *
 * Seeking is free — sgpc.net honours Range requests — so every jump costs
 * nothing beyond the bytes actually played.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The shortest segment the workbench will create. One definition: the timeline's
 * drag handles clamp with it and the editor's nudges derive from it — two
 * copies would let a drag place a boundary the nudges refuse.
 */
export const MIN_LENGTH = 0.1;

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** Coarse and fine steps. 10s hunts; 0.1s places. */
export const SKIP_COARSE = 10;
export const SKIP_FINE = 0.1;

export interface TagPlayer {
  playing: boolean;
  position: number;
  duration: number;
  speed: number;
  attach: (el: HTMLAudioElement | null) => void;
  toggle: () => void;
  seek: (to: number) => void;
  skip: (seconds: number) => void;
  setSpeed: (rate: number) => void;
  cycleSpeed: (direction: 1 | -1) => void;
  /**
   * Play from exactly this second. Once a loop round a cut; taggers found it
   * got in the way more than it helped, so a cut is now heard straight on.
   */
  playAt: (at: number) => void;
}

export function useTagPlayer(src: string | undefined): TagPlayer {
  const el = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeedState] = useState(1);

  /*
   * Read inside seek, which is memoised once — mirrored into a ref so it never
   * goes stale.
   *
   * Mirrored in an effect rather than during render: a render React throws away
   * still runs its body, so assigning here would publish a value from a render
   * that never happened. It has not bitten yet, but a ref written during render
   * is the kind of thing that only misbehaves once concurrent features are on.
   */
  const durationRef = useRef(0);
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    if (!src) return;
    /*
     * Created rather than rendered, so a re-render cannot restart the file a
     * tagger is halfway through. `crossOrigin` stays unset — sgpc.net sends no
     * Access-Control-Allow-Origin, and requiring one fails every track.
     */
    const node = new Audio(src);
    node.preload = 'metadata';
    node.playbackRate = speed;
    el.current = node;

    /*
     * Kept as an effect-body reset rather than a remount.
     *
     * This effect exists to build an external system — an HTMLAudioElement —
     * and these two lines are React catching up with the one it just built:
     * a new element is at 0 and has no known duration. The
     * alternative is keying the page on `src`, which would also throw away the
     * segments a tagger has open.
     *
     * Leaving them out is not an option either: the element's own events
     * (`loadedmetadata`, `timeupdate`) do not fire until bytes arrive over the
     * network, and until they do the transport would show the previous track's
     * clock against the new file.
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPosition(0);
    setDuration(0);

    const tick = () => setPosition(node.currentTime);
    const meta = () => setDuration(Number.isFinite(node.duration) ? node.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    node.addEventListener('timeupdate', tick);
    node.addEventListener('loadedmetadata', meta);
    node.addEventListener('play', onPlay);
    node.addEventListener('pause', onPause);

    return () => {
      node.pause();
      node.removeEventListener('timeupdate', tick);
      node.removeEventListener('loadedmetadata', meta);
      node.removeEventListener('play', onPlay);
      node.removeEventListener('pause', onPause);
      el.current = null;
    };
    // `speed` is read once at creation and applied by setSpeed after — putting
    // it in the deps would rebuild the element, and restart the file, on every
    // speed change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const attach = useCallback((node: HTMLAudioElement | null) => {
    el.current = node;
  }, []);

  const seek = useCallback((to: number) => {
    const a = el.current;
    if (!a) return;
    // Clamped at both ends: seeking past the duration leaves some browsers
    // stalled rather than at the end, and a negative time throws.
    a.currentTime = Math.min(Math.max(0, to), durationRef.current || Infinity);
    setPosition(a.currentTime);
  }, []);

  const skip = useCallback(
    (seconds: number) => seek((el.current?.currentTime ?? 0) + seconds),
    [seek]
  );

  const toggle = useCallback(() => {
    const a = el.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
  }, []);

  const setSpeed = useCallback((rate: number) => {
    setSpeedState(rate);
    if (el.current) el.current.playbackRate = rate;
  }, []);

  const cycleSpeed = useCallback(
    (direction: 1 | -1) => {
      const i = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
      const next = SPEEDS[Math.min(Math.max(0, i + direction), SPEEDS.length - 1)];
      if (next != null) setSpeed(next);
    },
    [speed, setSpeed]
  );

  const playAt = useCallback(
    (at: number) => {
      seek(at);
      void el.current?.play().catch(() => {});
    },
    [seek]
  );

  return {
    playing,
    position,
    duration,
    speed,
    attach,
    toggle,
    seek,
    skip,
    setSpeed,
    cycleSpeed,
    playAt,
  };
}
