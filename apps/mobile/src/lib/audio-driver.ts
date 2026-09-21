/**
 * The native half of the driver seam.
 *
 * expo-audio's player is created outside React so the store owns its lifetime:
 * a hook-created player is tied to whichever screen mounted it, and the whole
 * reason this app exists is that playback outlives the screen — and the app
 * being in the foreground at all.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import type { AudioDriver, DriverStatus, NowPlaying } from '@kp/playback';

/**
 * 100ms rather than expo-audio's 500ms default.
 *
 * The read-along follows sparse line timings, and half-second granularity
 * visibly lags the singing. It also sets how precisely playback can stop at a
 * segment's end.
 */
const UPDATE_INTERVAL_MS = 100;

export function createNativeAudioDriver(onStatus: (status: DriverStatus) => void): AudioDriver {
  let player: AudioPlayer | null = null;

  // `doNotMix` is required alongside setActiveForLockScreen — the lock screen
  // owns the session, so it cannot also duck under other apps.
  void setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
    allowsRecording: false,
    shouldRouteThroughEarpiece: false,
  });

  function release() {
    player?.remove();
    player = null;
  }

  return {
    load(url, startAt, nowPlaying) {
      release();
      player = createAudioPlayer({ uri: url }, { updateInterval: UPDATE_INTERVAL_MS });

      /*
       * Without this Android stops background playback after about three
       * minutes. The metadata is what actually fills the lock screen and
       * Control Center — passing none, as this did, left them showing the
       * app's name and nothing else.
       *
       * `isLiveStream` hides the duration, the scrub bar and the seek controls,
       * and a tagged shabad wants that as much as a broadcast does. The lock
       * screen reads the *file's* clock, and a file here is a 70-minute set: a
       * six-minute shabad would show a 94-minute bar, and dragging it would
       * land in a different shabad entirely. Hiding it is the honest answer
       * until expo-audio can be told a segment's own bounds.
       */
      player.setActiveForLockScreen(
        true,
        nowPlaying && {
          title: nowPlaying.title,
          artist: nowPlaying.artist,
          artworkUrl: nowPlaying.artworkUrl,
        },
        { isLiveStream: true }
      );

      player.addListener('playbackStatusUpdate', (status) => {
        onStatus({
          position: status.currentTime ?? 0,
          duration: Number.isFinite(status.duration) ? (status.duration ?? 0) : 0,
          playing: status.playing ?? false,
        });
      });

      // A seek before the file reports itself loaded is dropped, and playback
      // would begin at 0:00 of the file rather than at the shabad.
      if (startAt > 0) {
        const seekWhenReady = player.addListener('playbackStatusUpdate', (status) => {
          if (!status.isLoaded) return;
          void player?.seekTo(startAt);
          seekWhenReady.remove();
        });
      }
    },
    play() {
      player?.play();
    },
    pause() {
      player?.pause();
    },
    seek(seconds) {
      void player?.seekTo(Math.max(0, seconds));
    },
  };
}
