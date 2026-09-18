import { describe, expect, it } from 'vitest';

import { artworkFor } from './artwork';

describe('artworkFor', () => {
  it('is deterministic — an artist looks the same on every page', () => {
    expect(artworkFor('Bhai Harjinder Singh')).toEqual(artworkFor('Bhai Harjinder Singh'));
  });

  it('gives different names different gradients', () => {
    expect(artworkFor('Bhai Harjinder Singh').backgroundImage).not.toBe(
      artworkFor('Dyal Singh').backgroundImage
    );
  });

  it('never emits an undefined colour stop', () => {
    // The `>>` bug put a negative remainder into the hue index, `undefined`
    // into the oklch() stop, and the browser threw the whole gradient away —
    // a transparent tile with initials floating on the page behind it. It hit
    // roughly one name in seven.
    const names = [
      'Sri Harmandir Sahib',
      ...Array.from({ length: 500 }, (_, i) => `Bhai Test ${i} Singh`),
    ];
    for (const name of names) {
      const art = artworkFor(name);
      expect(art.backgroundImage).not.toContain('undefined');
      expect(art.colors.every((c) => !c.includes('undefined'))).toBe(true);
    }
  });

  it('never collapses into a single flat colour', () => {
    for (let i = 0; i < 300; i++) {
      const { colors } = artworkFor(`Name ${i}`);
      expect(colors[0]).not.toBe(colors[1]);
    }
  });

  it('skips the honorific when taking initials', () => {
    expect(artworkFor('Bhai Harjinder Singh').initials).toBe('HS');
    expect(artworkFor('Dr. Alankar Singh').initials).toBe('AS');
    expect(artworkFor('Giani Thakur Singh').initials).toBe('TS');
  });

  it('handles a one-word name and an empty one', () => {
    expect(artworkFor('Harjinder').initials).toBe('H');
    expect(() => artworkFor('')).not.toThrow();
  });
});
