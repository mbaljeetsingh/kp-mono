/**
 * Deterministic artwork.
 *
 * There is no cover art anywhere in this archive — SGPC publishes bare MP3s.
 * Rather than ship grey placeholder squares (which is what makes a music app
 * look broken), each artist and shabad gets a gradient derived from its own
 * name. Same name always yields the same colours, so an artist looks the same
 * on every page and becomes recognisable at a glance.
 */

/** FNV-1a — small, stable, and unlike a JS bitwise hash it distributes short
 *  strings well, which matters when most names start with "Bhai ". */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Hues are drawn from a warm, muted band (ambers, terracottas, deep reds and
 * greens) rather than the full wheel — a random 0–360 hue produces the
 * candy-coloured look that reads as generated. This stays close to the
 * devotional palette the material deserves.
 */
const HUES = [18, 32, 45, 8, 340, 268, 200, 165, 100, 55];

export function artworkFor(name: string) {
  const h = hash(name || 'kirtan');
  const i = h % HUES.length;
  const hue = HUES[i];
  // Offset rather than an independent pick: two hues can otherwise land on the
  // same value, collapsing the gradient into a flat, muddy tile.
  //
  // `>>>` rather than `>>`: `hash` returns an unsigned 32-bit value, and half
  // of those are negative once `>>` coerces them back to a signed int. A
  // negative remainder then indexed HUES out of bounds, `undefined` went into
  // the oklch() stop, and the browser threw the whole gradient away — leaving a
  // transparent tile with initials floating on the page behind it. It hit
  // roughly one name in seven, "Sri Harmandir Sahib" among them, everywhere
  // artwork appears.
  const hue2 = HUES[(i + 1 + ((h >>> 8) % (HUES.length - 1))) % HUES.length];
  const angle = 115 + ((h >>> 16) % 60);

  return {
    style: {
      backgroundImage:
        `linear-gradient(${angle}deg, ` +
        `oklch(0.62 0.13 ${hue}) 0%, ` +
        `oklch(0.45 0.10 ${hue2}) 55%, ` +
        `oklch(0.32 0.07 ${hue2}) 100%)`,
    },
    /** Two initials, skipping the honorific that prefixes most artist names. */
    initials: name
      .replace(/^(bhai|bibi|giani|ustad|prof\.?|dr\.?)\s+/i, '')
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join(''),
  };
}
