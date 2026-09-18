/**
 * Audio spike.
 *
 * Proves the one assumption the whole native decision rests on: that a segment
 * — a byte range of a long remote file — plays, seeks, stops at its own end,
 * and keeps going with the screen locked.
 *
 * The segment arithmetic is imported, not written here. That is the point of
 * `@kp/core`: the web player and this app run the same functions over the same
 * `Playable`, and only the driver underneath differs.
 */
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import {
  elapsedIn,
  hasReachedEnd,
  progressPct,
  seekTargetForPct,
  segmentTotal,
  startPositionFor,
  type Playable,
} from '@kp/core';

/**
 * Stand-in for a tagged rendition while sgpc.net is returning 522s.
 *
 * Any host that answers `206` with `accept-ranges: bytes` exercises the same
 * path SGPC does — which is what makes seeking into a 70-minute set cheap.
 * Swap `url` for a real recording when the origin is back.
 */
const SPIKE: Playable = {
  id: 'spike-1',
  title: 'Segment spike',
  artist: 'kp-mono',
  url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  // A 45-second window well inside the file: long enough to hear, short enough
  // that the boundary stop is easy to sit and watch for.
  startSec: 60,
  endSec: 105,
};

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function SpikeScreen() {
  // 100ms rather than the 500ms default: the lyrics panel follows sparse
  // `lineTimings`, and half-second granularity would visibly lag the singing.
  const player = useAudioPlayer(SPIKE.url, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);

  const [boundaryHitAt, setBoundaryHitAt] = useState<number | null>(null);
  const [ticks, setTicks] = useState(0);
  const seeded = useRef(false);

  useEffect(() => {
    // `doNotMix` is required alongside setActiveForLockScreen — the lock screen
    // owns the session, so it cannot also duck under other apps.
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
    });

    // Without this Android stops background playback after ~3 minutes. It is
    // also what puts the title and artist on the lock screen.
    player.setActiveForLockScreen(true, {
      title: SPIKE.title,
      artist: SPIKE.artist,
      albumTitle: 'Sri Harmandir Sahib',
    });
  }, [player]);

  // Seek to the segment's own start once the file reports itself loaded — a
  // seek issued before that is dropped, and playback would begin at 0:00 of
  // the file rather than at the shabad.
  useEffect(() => {
    if (seeded.current || !status.isLoaded) return;
    seeded.current = true;
    player.seekTo(startPositionFor(SPIKE));
  }, [status.isLoaded, player]);

  const position = status.currentTime ?? 0;
  const duration = status.duration ?? 0;

  // A segment's end is not the file's end, so nothing native will ever fire
  // `ended` here. The player has to watch the clock and stop itself.
  useEffect(() => {
    setTicks((n) => n + 1);
    if (!status.playing) return;
    if (hasReachedEnd(SPIKE, position)) {
      player.pause();
      setBoundaryHitAt(position);
    }
  }, [position, status.playing, player]);

  const pct = progressPct(SPIKE, position, duration);

  return (
    <ScrollView className="flex-1 bg-neutral-950" contentContainerClassName="p-6 pt-20 gap-5">
      <View className="gap-1">
        <Text className="text-2xl font-semibold text-white">{SPIKE.title}</Text>
        <Text className="text-sm text-neutral-400">
          {SPIKE.startSec}s – {SPIKE.endSec}s of a {clock(duration)} file
        </Text>
      </View>

      <View className="h-2 overflow-hidden rounded-full bg-neutral-800">
        <View className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
      </View>

      <View className="flex-row justify-between">
        <Text className="text-lg tabular-nums text-white">
          {clock(elapsedIn(SPIKE, position))}
        </Text>
        <Text className="text-lg tabular-nums text-neutral-500">
          {clock(segmentTotal(SPIKE, duration))}
        </Text>
      </View>

      <View className="flex-row gap-3">
        <Pressable
          className="flex-1 items-center rounded-xl bg-amber-400 py-4 active:opacity-80"
          onPress={() => {
            if (status.playing) {
              player.pause();
              return;
            }
            // Restarting after the boundary means going back to the segment's
            // start, not resuming where the file happens to be parked.
            if (boundaryHitAt != null) {
              player.seekTo(startPositionFor(SPIKE));
              setBoundaryHitAt(null);
            }
            player.play();
          }}>
          <Text className="text-base font-semibold text-neutral-950">
            {status.playing ? 'Pause' : 'Play'}
          </Text>
        </Pressable>

        <Pressable
          className="items-center rounded-xl bg-neutral-800 px-5 py-4 active:opacity-80"
          onPress={() => player.seekTo(seekTargetForPct(SPIKE, 80, duration))}>
          <Text className="text-base font-semibold text-white">Seek 80%</Text>
        </Pressable>
      </View>

      <View className="gap-2 rounded-xl bg-neutral-900 p-4">
        <Text className="mb-1 text-xs uppercase tracking-wider text-neutral-500">Checks</Text>
        <Row label="Loaded" value={status.isLoaded ? 'yes' : 'no'} />
        <Row label="Playing" value={status.playing ? 'yes' : 'no'} />
        <Row label="Position in file" value={`${position.toFixed(2)}s`} />
        <Row label="Elapsed in segment" value={`${elapsedIn(SPIKE, position).toFixed(2)}s`} />
        <Row label="Progress" value={`${pct.toFixed(1)}%`} />
        <Row label="Status updates" value={`${ticks}`} />
        <Row
          label="Stopped at endSec"
          value={boundaryHitAt == null ? 'not yet' : `yes, at ${boundaryHitAt.toFixed(2)}s`}
        />
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between">
      <Text className="text-sm text-neutral-400">{label}</Text>
      <Text className="text-sm tabular-nums text-white">{value}</Text>
    </View>
  );
}
