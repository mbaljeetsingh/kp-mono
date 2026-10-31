import { describe, expect, it } from 'vitest';

import { confirmedKbps, id3Size, isExpectedSlice, readMp3Layout, sliceBytes } from './mp3';

/** MPEG-1 Layer III, 128 kbps, 44.1 kHz. */
const MPEG1_128 = [0xff, 0xfb, 0x90, 0x00];
/** MPEG-2 Layer III, 64 kbps, 22.05 kHz: the same rate index means something else. */
const MPEG2_64 = [0xff, 0xf3, 0x80, 0x00];

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe('id3Size', () => {
  it('reads the synchsafe size and counts the header', () => {
    expect(id3Size(new Uint8Array([...ascii('ID3'), 4, 0, 0, 0, 0, 1, 0]))).toBe(128 + 10);
  });

  it('is zero without a tag', () => {
    expect(id3Size(new Uint8Array(MPEG1_128))).toBe(0);
  });
});

describe('readMp3Layout', () => {
  it('reads an MPEG-1 frame', () => {
    expect(readMp3Layout(new Uint8Array(MPEG1_128))).toEqual({ audioStart: 0, kbps: 128 });
  });

  it('uses the MPEG-2 table for an MPEG-2 frame', () => {
    expect(readMp3Layout(new Uint8Array(MPEG2_64))?.kbps).toBe(64);
  });

  it('adds where the bytes were read from', () => {
    expect(readMp3Layout(new Uint8Array([0, 0, ...MPEG1_128]), 1000)?.audioStart).toBe(1002);
  });

  it('skips a stray 0xFF that is not a valid header', () => {
    expect(readMp3Layout(new Uint8Array([0xff, 0xff, 0xff, 0xff, ...MPEG1_128]))?.audioStart).toBe(
      4
    );
  });

  it('refuses a variable bitrate file', () => {
    const frame = [...MPEG1_128, ...new Array(32).fill(0), ...ascii('Xing')];
    expect(readMp3Layout(new Uint8Array(frame))).toBeNull();
  });

  it('accepts the Info tag, which marks a constant bitrate file', () => {
    const frame = [...MPEG1_128, ...new Array(32).fill(0), ...ascii('Info')];
    expect(readMp3Layout(new Uint8Array(frame))?.kbps).toBe(128);
  });

  it('is null with no frame at all', () => {
    expect(readMp3Layout(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
  });
});

describe('confirmedKbps', () => {
  /** A 128 kbps, 44.1 kHz frame is 417 bytes without padding. */
  const frame = () => [...MPEG1_128, ...new Array(413).fill(0)];

  it('reads a header followed by another frame', () => {
    expect(confirmedKbps(new Uint8Array([1, 2, ...frame(), ...MPEG1_128]))).toBe(128);
  });

  it('skips a false header with no frame after it', () => {
    const bytes = [0xff, 0xfb, 0x50, 0x00, 0, 0, ...frame(), ...MPEG1_128];
    expect(confirmedKbps(new Uint8Array(bytes))).toBe(128);
  });

  it('uses the MPEG-2 table and frame length', () => {
    const mpeg2 = [...MPEG2_64, ...new Array(204).fill(0), ...MPEG2_64];
    expect(confirmedKbps(new Uint8Array(mpeg2))).toBe(64);
  });

  it('is null with no confirmed frame', () => {
    expect(confirmedKbps(new Uint8Array(MPEG1_128))).toBeNull();
  });
});

describe('isExpectedSlice', () => {
  const layout = { audioStart: 0, kbps: 64 };
  const range = { from: 1000, to: 1000 + 100_000 - 1 };

  it('accepts the slice, and one short by the padding', () => {
    expect(isExpectedSlice(100_000, layout, range)).toBe(true);
    expect(isExpectedSlice(100_000 - 16_000, layout, range)).toBe(true);
  });

  it('refuses a whole recording', () => {
    expect(isExpectedSlice(50_000_000, layout, range)).toBe(false);
  });

  it('refuses a dropped connection', () => {
    expect(isExpectedSlice(1000, layout, range)).toBe(false);
  });
});

describe('sliceBytes', () => {
  it('counts from the first frame, with room past the end', () => {
    expect(sliceBytes({ audioStart: 100, kbps: 64 }, 10, 20)).toEqual({
      from: 100 + 80_000,
      to: 100 + 176_000,
    });
  });
});
