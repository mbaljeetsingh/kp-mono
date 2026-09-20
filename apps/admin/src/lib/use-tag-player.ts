/**
 * Playback built for tagging, not for listening.
 *
 * A browser's default transport cannot do what this task needs: hunting a
 * shabad boundary in a 70-minute set means skipping in fixed steps, slowing
 * down to place the cut, and looping a few seconds either side to check it.
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

/** How far either side of a boundary the audition loop reaches. */
const AUDITION_PAD = 4;

export interface TagPlayer {
  playing: boolean;
  position: number;
  duration: number;
  speed: number;
  /** Set while auditioning a boundary — the loop has no other way out. */
  loop: { start: number; end: number } | null;
  attach: (el: HTMLAudioElement | null) => void;
  toggle: () => void;
  seek: (to: number) => void;
  skip: (seconds: number) => void;
  setSpeed: (rate: number) => void;
  cycleSpeed: (direction: 1 | -1) => void;
  /**
   * Loop the last few seconds before a cut and the first few after it — the
   * only way to hear whether a boundary actually falls in the gap.
   */
  auditionBoundary: (at: number) => void;
  stopLoop: () => void;
}

export function useTagPlayer(src: string | undefined): TagPlayer {
  const el = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeedState] = useState(1);
  const [loop, setLoop] = useState<{ start: number; end: number } | null>(null);

  /*
   * Read inside the timeupdate handler, which is attached once — mirrored into
   * refs so the listener never goes stale.
   *
   * Mirrored in an effect rather than during render: a render React throws away
   * still runs its body, so assigning here would publish a value from a render
   * that never happened. It has not bitten yet, but a ref written during render
   * is the kind of thing that only misbehaves once concurrent features are on.
   */
  const loopRef = useRef(loop);
  const durationRef = useRef(0);
  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);
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
    setPosition(0);
    setDuration(0);
    setLoop(null);

    const tick = () => {
      setPosition(node.currentTime);
      // Auditioning: jump back to the window's start rather than letting
      // playback run on into the next shabad.
      const window_ = loopRef.current;
      if (window_ && node.currentTime >= window_.end) node.currentTime = window_.start;
    };
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

  const auditionBoundary = useCallback(
    (at: number) => {
      const window_ = { start: Math.max(0, at - AUDITION_PAD), end: at + AUDITION_PAD };
      setLoop(window_);
      seek(window_.start);
      void el.current?.play().catch(() => {});
    },
    [seek]
  );

  const stopLoop = useCallback(() => setLoop(null), []);

  return {
    playing,
    position,
    duration,
    speed,
    loop,
    attach,
    toggle,
    seek,
    skip,
    setSpeed,
    cycleSpeed,
    auditionBoundary,
    stopLoop,
  };
}
