/**
 * The native half of the driver seam.
 *
 * expo-audio's player is created outside React so the store owns its lifetime:
 * a hook-created player is tied to whichever screen mounted it, and the whole
 * reason this app exists is that playback outlives the screen — and the app
 * being in the foreground at all.
 */
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioLockScreenOptions,
  type AudioPlayer,
} from 'expo-audio';
import { Platform } from 'react-native';
import type { AudioDriver, DriverStatus, NowPlaying } from '@kp/playback';

/**
 * 100ms rather than expo-audio's 500ms default.
 *
 * The read-along follows sparse line timings, and half-second granularity
 * visibly lags the singing. It also sets how precisely playback can stop at a
 * segment's end.
 */
const UPDATE_INTERVAL_MS = 100;

/** The lock screen's next and previous buttons, which the queue answers. */
export type LockScreenCommand = 'next' | 'previous';

export function createNativeAudioDriver(
  onStatus: (status: DriverStatus) => void,
  onCommand: (command: LockScreenCommand) => void
): AudioDriver {
  /*
   * One player for the whole session, its source swapped on each load.
   *
   * This used to remove the player and build a new one per shabad, and with the
   * phone locked the next shabad never started: removing a player can release
   * the audio session, and iOS will not let a backgrounded app take a
   * non-mixing session back. (Android's media service goes with its player in
   * the same way.) `keepAudioSessionActive` holds the session across pauses
   * and swaps for the same reason.
   */
  let player: AudioPlayer | null = null;
  let loadedUrl: string | null = null;

  /*
   * Set while a load settles: from the swap until the new source is loaded and
   * the seek to the shabad has landed. Status in that window still carries the
   * previous position — 40 minutes into the last shabad's file, past this
   * one's end — and the store, which already holds the new item, would read it
   * as finished and skip straight past it. So it is not reported.
   */
  let settling: { id: number; startAt: number; seeking: boolean; play: boolean } | null = null;
  let loads = 0;

  /*
   * How long a load may settle before status flows again regardless. A source
   * that never loads — a file sgpc.net has moved, a dropped connection — would
   * otherwise swallow every status and every play for good: the store stuck
   * on "starting", the play button dead.
   */
  const SETTLE_TIMEOUT_MS = 15_000;

  // `doNotMix` is required alongside setActiveForLockScreen — the lock screen
  // owns the session, so it cannot also duck under other apps.
  void setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
    allowsRecording: false,
    shouldRouteThroughEarpiece: false,
  });

  function settle(id: number) {
    if (settling?.id !== id) return;
    const play = settling.play;
    settling = null;
    if (play) player?.play();
  }

  function create(url: string): AudioPlayer {
    const next = createAudioPlayer(
      { uri: url },
      { updateInterval: UPDATE_INTERVAL_MS, keepAudioSessionActive: true }
    );
    next.addListener('playbackStatusUpdate', (status) => {
      if (settling) {
        if (!status.isLoaded || settling.seeking) return;
        const { id, startAt } = settling;
        if (startAt <= 0) {
          settle(id);
        } else {
          // A seek before the file reports itself loaded is dropped, and
          // playback would begin at 0:00 of the file rather than at the shabad.
          settling.seeking = true;
          void next.seekTo(startAt).finally(() => settle(id));
        }
        return;
      }
      onStatus({
        position: status.currentTime ?? 0,
        duration: Number.isFinite(status.duration) ? (status.duration ?? 0) : 0,
        playing: status.playing ?? false,
      });
    });
    // Not in expo-audio: patches/expo-audio@57.0.5.patch adds the buttons and
    // this event (iOS only, for now).
    (
      next as unknown as {
        addListener(event: 'lockScreenCommand', cb: (e: { command: string }) => void): void;
      }
    ).addListener('lockScreenCommand', ({ command }) => {
      if (command === 'next' || command === 'previous') onCommand(command);
    });
    return next;
  }

  /*
   * What the lock screen is told about the clock.
   *
   * A shabad is a slice of a recording that often runs 70 minutes, and the
   * lock screen reads the file's clock: left alone it shows that 70-minute
   * bar, and a drag on it lands in some other shabad. On iOS the patch takes
   * the slice and shows the shabad as the whole track — its own length, its
   * own position, a drag that stays inside it. Android is not patched yet, so
   * there `isLiveStream` hides the bar and the seek controls instead, as it did
   * everywhere before. A broadcast has no length on either.
   */
  function lockScreenOptions(nowPlaying?: NowPlaying): AudioLockScreenOptions {
    if (!nowPlaying?.isLive && nowPlaying?.segment && Platform.OS === 'ios') {
      return { segmentStart: nowPlaying.segment.start, segmentEnd: nowPlaying.segment.end };
    }
    return { isLiveStream: true };
  }

  function metadata(nowPlaying?: NowPlaying) {
    return (
      nowPlaying && {
        title: nowPlaying.title,
        artist: nowPlaying.artist,
        artworkUrl: nowPlaying.artworkUrl,
      }
    );
  }

  return {
    load(url, startAt, nowPlaying) {
      const id = ++loads;
      setTimeout(() => settle(id), SETTLE_TIMEOUT_MS);

      if (player && url === loadedUrl) {
        // The next shabad is often in the same recording: seek, don't reload.
        settling = { id, startAt, seeking: true, play: false };
        void player.seekTo(startAt).finally(() => settle(id));
      } else if (player) {
        settling = { id, startAt, seeking: false, play: false };
        player.replace({ uri: url });
      } else {
        settling = { id, startAt, seeking: false, play: false };
        player = create(url);
      }
      loadedUrl = url;

      // Without this Android stops background playback after about three
      // minutes. The metadata is what fills the lock screen and Control Center.
      player.setActiveForLockScreen(true, metadata(nowPlaying), lockScreenOptions(nowPlaying));
    },
    play() {
      // Mid-load, play once the shabad is in place rather than from wherever
      // the swap left the file.
      if (settling) settling.play = true;
      else player?.play();
    },
    pause() {
      if (settling) settling.play = false;
      player?.pause();
    },
    seek(seconds) {
      void player?.seekTo(Math.max(0, seconds));
    },
    // The lock screen's title in the newly chosen script; the audio plays on.
    announce(nowPlaying) {
      const m = metadata(nowPlaying);
      if (m) player?.updateLockScreenMetadata(m);
    },
  };
}
