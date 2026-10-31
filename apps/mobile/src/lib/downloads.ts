/**
 * Shabads kept on this phone (#6).
 *
 * Only the shabad's own bytes, cut from the recording with a Range request: a
 * tagged shabad is a few MB and its recording can be hundreds. The phone can ask
 * for that where a browser cannot, because sgpc.net sends no CORS headers.
 *
 * The record holds a file name rather than a path, because iOS moves the app's
 * container on update and a stored path would stop resolving. It also holds the
 * whole item, timings included, because the list has to work with no connection
 * to fetch it from. That copy is what a listener deliberately kept, unlike the
 * queue's, which is why it may go stale here and not there.
 */
import { fetchShabadText, type ShabadText } from '@kp/api';
import {
  confirmedKbps,
  id3Size,
  isExpectedSlice,
  readMp3Layout,
  sliceBytes,
  type Mp3Layout,
  type Playable,
} from '@kp/core';
import { Directory, File, Paths } from 'expo-file-system';
import { useMemo, useSyncExternalStore } from 'react';
import { useMMKVString } from 'react-native-mmkv';

import { BANIDB_BASE } from './links';
import { mmkv } from './storage';

const KEY = 'kp:downloads';

/** Enough for most ID3 tags and the first frame after them. */
const PROBE_BYTES = 65536;

interface Download {
  item: Playable;
  fileName: string;
  bytes: number;
  /** The words, so the read-along works with no connection as well. */
  text?: ShabadText;
}

type Downloads = Record<string, Download>;

function parse(raw: string | null | undefined): Downloads {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Downloads) : {};
  } catch {
    return {};
  }
}

function folder(): Directory {
  return new Directory(Paths.document, 'downloads');
}

function fileFor(fileName: string): File {
  return new File(folder(), fileName);
}

/**
 * Downloads under way, here rather than in the sheet that started one: the sheet
 * can close and reopen meanwhile, and a second run would write over the same file.
 */
const inFlight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function read(): Downloads {
  return parse(mmkv.getString(KEY));
}

function write(next: Downloads) {
  mmkv.set(KEY, JSON.stringify(next));
}

/** Only a tagged shabad has a slice to keep; a whole recording or a broadcast does not. */
export function canDownload(item: Playable): boolean {
  return !item.isLive && item.startSec != null && item.endSec != null;
}

async function probe(url: string, from: number): Promise<Uint8Array> {
  const res = await fetch(url, {
    headers: { Range: `bytes=${from}-${from + PROBE_BYTES - 1}` },
  });
  // A 200 would be the whole recording arriving on a phone's data plan.
  if (res.status !== 206) throw new Error(`The archive answered ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function layoutOf(url: string): Promise<Mp3Layout> {
  const head = await probe(url, 0);
  const tag = id3Size(head);
  const layout = tag < head.length ? readMp3Layout(head.subarray(tag), tag) : null;
  if (layout) return layout;
  // A tag longer than the probe, with cover art in it, say. Otherwise the file
  // really is one this cannot cut, and looking again costs one small request.
  const after = await probe(url, tag);
  const found = readMp3Layout(after, tag);
  if (!found) throw new Error('This recording cannot be cut into a download.');
  return found;
}

/** Asking for one already on its way joins it rather than starting another. */
export function downloadRendition(item: Playable): Promise<void> {
  const running = inFlight.get(item.id);
  if (running) return running;
  const started = fetchSlice(item).finally(() => {
    inFlight.delete(item.id);
    notify();
  });
  inFlight.set(item.id, started);
  notify();
  return started;
}

export function useIsDownloading(id: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => inFlight.has(id)
  );
}

async function fetchSlice(item: Playable): Promise<void> {
  if (!canDownload(item)) throw new Error('Only a tagged shabad can be downloaded.');
  const layout = await layoutOf(item.url);
  const { from, to } = sliceBytes(layout, item.startSec!, item.endSec!);

  // The cut assumes one bitrate throughout, and the first frame cannot promise
  // that. Looking where the cut lands, and halfway through, catches a variable
  // or stitched recording before it plays the wrong passage under the wrong words.
  for (const at of [from, Math.floor((from + to) / 2)]) {
    if (confirmedKbps(await probe(item.url, at)) !== layout.kbps) {
      throw new Error('This recording cannot be cut into a download.');
    }
  }

  const dir = folder();
  if (!dir.exists) dir.create({ intermediates: true });
  const fileName = `${item.id}.mp3`;
  const file = await File.downloadFileAsync(item.url, fileFor(fileName), {
    headers: { Range: `bytes=${from}-${to}` },
    idempotent: true,
  });
  if (!isExpectedSlice(file.size, layout, { from, to })) {
    file.delete();
    throw new Error('The download did not arrive whole. Try again.');
  }
  // Asked for after the audio, and allowed to fail: the audio is what was asked
  // for, and it is worth keeping even if BaniDB is having a bad moment.
  const text = item.shabadId
    ? await fetchShabadText(BANIDB_BASE, item.shabadId).catch(() => undefined)
    : undefined;
  write({ ...read(), [item.id]: { item, fileName, bytes: file.size, text } });
}

export function removeDownload(id: string) {
  const all = read();
  const entry = all[id];
  if (!entry) return;
  const { [id]: _removed, ...rest } = all;
  write(rest);
  sweep();
}

export function removeAllDownloads() {
  write({});
  sweep();
}

/** The name of the file the player has open, which is left alone until it moves on. */
let playingFile: string | null = null;

/**
 * Delete every file no record claims. Removing a download only drops its record
 * and lands here, so the shabad playing keeps its file until the next one loads,
 * and a download cut off by the app being killed does not take up room for good.
 */
function sweep() {
  try {
    const dir = folder();
    if (!dir.exists) return;
    const kept = new Set(Object.values(read()).map((e) => e.fileName));
    for (const entry of dir.list()) {
      if (!(entry instanceof File)) continue;
      if (kept.has(entry.name) || entry.name === playingFile) continue;
      if (inFlight.has(entry.name.replace(/\.mp3$/, ''))) continue;
      entry.delete();
    }
  } catch {
    // Tidying up: a file left behind costs room, and must not stop the audio.
  }
}

// At launch, with nothing playing and nothing under way.
sweep();

/**
 * The local file for what is about to load, if there is one. Called by the audio
 * driver, which works in URLs: two shabads of one recording share a URL, so the
 * segment is what tells them apart.
 */
export function localSource(url: string, segment?: { start: number; end: number }): string | null {
  const next = segment ? findLocal(url, segment) : null;
  const name = next?.name ?? null;
  if (name !== playingFile) {
    playingFile = name;
    sweep();
  }
  return next?.uri ?? null;
}

function findLocal(url: string, segment: { start: number; end: number }): File | null {
  for (const entry of Object.values(read())) {
    const { item } = entry;
    if (item.url !== url || item.startSec !== segment.start || item.endSec !== segment.end) {
      continue;
    }
    // Gone from under the record (the listener cleared storage, say): play from
    // the archive rather than fail.
    const file = fileFor(entry.fileName);
    return file.exists ? file : null;
  }
  return null;
}

/** The words of a shabad, if a download holds them. Renditions of one shabad share them. */
export function savedShabadText(shabadId: number | null | undefined): ShabadText | undefined {
  if (!shabadId) return undefined;
  return Object.values(read()).find((e) => e.item.shabadId === shabadId && e.text)?.text;
}

/** What is kept here, newest last, and how much room it takes. */
export function useDownloads() {
  const [raw] = useMMKVString(KEY, mmkv);
  return useMemo(() => {
    const entries = Object.values(parse(raw));
    return {
      ids: new Set(entries.map((e) => e.item.id)),
      items: entries.map((e) => e.item),
      bytes: entries.reduce((sum, e) => sum + e.bytes, 0),
    };
  }, [raw]);
}
