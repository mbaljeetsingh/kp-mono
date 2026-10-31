/**
 * Where a shabad sits inside an archive MP3, in bytes.
 *
 * A shabad is a few MB of a recording that can run to hundreds, so the phone
 * keeps only that slice (#6). It works because the archive is constant bitrate:
 * sampled across the file, the rate holds, and no file carries a Xing or VBRI
 * table. A file that does carry one has no straight line from seconds to bytes,
 * so it is refused rather than cut in the wrong place.
 */

/** Layer III kbps by index. MPEG-2 has its own table, and half the archive is 22 kHz. */
const MPEG1_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MPEG2_KBPS = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

/**
 * Past the end, so a player working from a rounded clock still reaches the
 * shabad's end before the file runs out. Otherwise nothing would ever tell the
 * store this item had finished.
 */
const SLICE_PADDING_SECONDS = 2;

export interface Mp3Layout {
  /** Byte where the first audio frame starts. */
  audioStart: number;
  kbps: number;
}

/** Bytes before the audio when the file opens with an ID3v2 tag, else 0. */
export function id3Size(bytes: Uint8Array): number {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0;
  // Synchsafe: seven bits a byte, so the tag cannot be mistaken for a frame.
  const size =
    ((bytes[6]! & 0x7f) << 21) |
    ((bytes[7]! & 0x7f) << 14) |
    ((bytes[8]! & 0x7f) << 7) |
    (bytes[9]! & 0x7f);
  return size + 10;
}

function hasTag(bytes: Uint8Array, at: number, tag: string): boolean {
  return [...tag].every((c, i) => bytes[at + i] === c.charCodeAt(0));
}

/**
 * The constant bitrate of the first frame in `bytes`, which were read from file
 * offset `offset`. Null when there is no such frame, or the file is variable
 * bitrate.
 */
export function readMp3Layout(bytes: Uint8Array, offset = 0): Mp3Layout | null {
  for (let i = 0; i + 4 <= bytes.length; i++) {
    if (bytes[i] !== 0xff || (bytes[i + 1]! & 0xe0) !== 0xe0) continue;
    const version = (bytes[i + 1]! >> 3) & 3;
    const layer = (bytes[i + 1]! >> 1) & 3;
    const rateIndex = bytes[i + 2]! >> 4;
    const sampleIndex = (bytes[i + 2]! >> 2) & 3;
    // Layer III only, and not the reserved values that make a stray 0xFF in the
    // data look like a header.
    if (version === 1 || layer !== 1 || rateIndex === 0 || rateIndex === 15 || sampleIndex === 3) {
      continue;
    }
    // A VBR table lives inside the first frame, within its side information.
    for (let j = i + 4; j < i + 64 && j + 4 <= bytes.length; j++) {
      if (hasTag(bytes, j, 'Xing') || hasTag(bytes, j, 'VBRI')) return null;
    }
    const kbps = (version === 3 ? MPEG1_KBPS : MPEG2_KBPS)[rateIndex]!;
    return { audioStart: offset + i, kbps };
  }
  return null;
}

/** The inclusive byte range holding these seconds, for an HTTP Range header. */
export function sliceBytes(
  layout: Mp3Layout,
  startSec: number,
  endSec: number
): { from: number; to: number } {
  const bytesPerSecond = (layout.kbps * 1000) / 8;
  return {
    from: layout.audioStart + Math.floor(startSec * bytesPerSecond),
    to: layout.audioStart + Math.ceil((endSec + SLICE_PADDING_SECONDS) * bytesPerSecond),
  };
}
