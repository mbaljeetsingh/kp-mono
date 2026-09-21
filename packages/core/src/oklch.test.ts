import { describe, expect, it } from 'vitest';

import { oklchToHex } from './oklch';

describe('oklchToHex', () => {
  it('converts the achromatic ends', () => {
    expect(oklchToHex(0, 0, 0)).toBe('#000000');
    expect(oklchToHex(1, 0, 0)).toBe('#ffffff');
  });

  it('places lightness where Oklab actually places it', () => {
    // Oklab is perceptually uniform, so its L does not line up with sRGB's
    // numeric midpoint: L=0.5 is #636363, and sRGB mid-grey #808080 lands
    // nearer L=0.60. Anchored on those two rather than on an intuition.
    expect(oklchToHex(0.5, 0, 0)).toBe('#636363');
    expect(oklchToHex(0.5985, 0, 0)).toBe('#808080');
  });

  it('keeps an achromatic colour achromatic', () => {
    const hex = oklchToHex(0.45, 0, 210);
    expect(hex.slice(1, 3)).toBe(hex.slice(3, 5));
    expect(hex.slice(3, 5)).toBe(hex.slice(5, 7));
  });

  it('puts warm hues where they belong — red leads at hue 30', () => {
    const hex = oklchToHex(0.6, 0.15, 30);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(g!);
    expect(g).toBeGreaterThan(b!);
  });

  it('puts green ahead at hue 150', () => {
    const hex = oklchToHex(0.6, 0.15, 150);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    expect(g).toBeGreaterThan(r!);
    expect(g).toBeGreaterThan(b!);
  });

  it('always emits a parseable six-digit hex, even out of gamut', () => {
    for (let hue = 0; hue < 360; hue += 7) {
      // A chroma far outside sRGB, to force the clamp.
      expect(oklchToHex(0.7, 0.5, hue)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
