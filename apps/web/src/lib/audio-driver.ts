/**
 * The web half of the driver seam.
 *
 * One `<audio>` element for the whole app, created here rather than rendered,
 * because there is exactly one and nothing should be able to unmount it. The
 * mobile app implements the same four methods over expo-audio; everything
 * above this line is shared.
 */
import type { AudioDriver, DriverStatus } from '@kp/playback';

/**
 * How often to report position.
 *
 * The browser's own `timeupdate` fires around 4Hz and at the browser's
 * discretion, which is too coarse and too irregular for a read-along that
 * follows sparse line timings. A timer at the same 100ms the mobile app uses
 * keeps the two surfaces behaving identically.
 */
const STATUS_INTERVAL_MS = 100;

export function createWebAudioDriver(onStatus: (status: DriverStatus) => void): AudioDriver {
  const el = new Audio();
  el.preload = 'metadata';
  // `crossOrigin` is deliberately NOT set. Setting it to 'anonymous' makes the
  // browser *require* an Access-Control-Allow-Origin header, and sgpc.net sends
  // none — every track then fails with a CORS error before a byte is played.
  // Plain media playback needs no CORS at all; it only costs Web Audio analysis
  // and a tainted canvas, neither of which this player does. The Vue app never
  // set it either.

  let timer: ReturnType<typeof setInterval> | null = null;

  function report() {
    onStatus({
      position: el.currentTime,
      duration: Number.isFinite(el.duration) ? el.duration : 0,
      playing: !el.paused,
    });
  }

  function startReporting() {
    if (timer) return;
    timer = setInterval(report, STATUS_INTERVAL_MS);
  }

  function stopReporting() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    // One last report so the UI settles on the true paused position rather
    // than wherever the previous tick left it.
    report();
  }

  el.addEventListener('playing', startReporting);
  el.addEventListener('pause', stopReporting);
  el.addEventListener('ended', stopReporting);
  // Setting currentTime at readyState 0 fires no timeupdate, so without this
  // a restored-but-unplayed item would read 0:00 until playback started.
  el.addEventListener('loadedmetadata', report);

  return {
    load(url, startAt) {
      el.src = url;
      // Assigning src resets the clock, so the seek has to follow it — and it
      // only lands once the browser knows the file is seekable.
      const seek = () => {
        el.currentTime = startAt;
        report();
        el.removeEventListener('loadedmetadata', seek);
      };
      el.addEventListener('loadedmetadata', seek);
    },
    play() {
      // A refused play must not leave the transport claiming to be playing —
      // autoplay policies reject this routinely on first load.
      void el.play().catch(() => report());
    },
    pause() {
      el.pause();
    },
    seek(seconds) {
      el.currentTime = seconds;
      report();
    },
  };
}
