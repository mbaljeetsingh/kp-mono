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
import { id3Size, readMp3Layout, sliceBytes, type Mp3Layout, type Playable } from '@kp/core';
import { Directory, File, Paths } from 'expo-file-system';
import { useMemo } from 'react';
import { useMMKVString } from 'react-native-mmkv';

import { mmkv } from './storage';

const KEY = 'kp:downloads';

/** Enough for most ID3 tags and the first frame after them. */
const PROBE_BYTES = 65536;

interface Download {
  item: Playable;
  fileName: string;
  bytes: number;
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

export async function downloadRendition(item: Playable): Promise<void> {
  if (!canDownload(item)) throw new Error('Only a tagged shabad can be downloaded.');
  const layout = await layoutOf(item.url);
  const { from, to } = sliceBytes(layout, item.startSec!, item.endSec!);

  const dir = folder();
  if (!dir.exists) dir.create({ intermediates: true });
  const fileName = `${item.id}.mp3`;
  const file = await File.downloadFileAsync(item.url, fileFor(fileName), {
    headers: { Range: `bytes=${from}-${to}` },
    idempotent: true,
  });
  write({ ...read(), [item.id]: { item, fileName, bytes: file.size } });
}

export function removeDownload(id: string) {
  const all = read();
  const entry = all[id];
  if (!entry) return;
  const file = fileFor(entry.fileName);
  if (file.exists) file.delete();
  const { [id]: _removed, ...rest } = all;
  write(rest);
}

export function removeAllDownloads() {
  const dir = folder();
  if (dir.exists) dir.delete();
  write({});
}

/**
 * The local file for what is about to load, if there is one. Called by the audio
 * driver, which works in URLs: two shabads of one recording share a URL, so the
 * segment is what tells them apart.
 */
export function localSource(url: string, segment?: { start: number; end: number }): string | null {
  if (!segment) return null;
  for (const entry of Object.values(read())) {
    const { item } = entry;
    if (item.url !== url || item.startSec !== segment.start || item.endSec !== segment.end) {
      continue;
    }
    // Gone from under the record (the listener cleared storage, say): play from
    // the archive rather than fail.
    const file = fileFor(entry.fileName);
    return file.exists ? file.uri : null;
  }
  return null;
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
