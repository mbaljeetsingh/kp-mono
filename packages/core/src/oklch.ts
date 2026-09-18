/**
 * oklch → sRGB hex.
 *
 * CSS understands `oklch()`; React Native does not — it silently treats an
 * unparseable colour as no colour, so an artwork tile rendered as bare initials
 * on nothing. Converting here means both surfaces get the same value and both
 * can actually use it.
 *
 * The matrices are Björn Ottosson's Oklab definition. Out-of-gamut results are
 * clamped per channel rather than gamut-mapped: every colour this is used with
 * is well inside sRGB, and a proper mapping would be a lot of maths for a
 * difference nobody could see.
 */
function toHexPair(value: number): string {
  return Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, '0');
}

/** Linear-light channel to sRGB, the usual piecewise transfer curve. */
function gamma(channel: number): number {
  return channel <= 0.0031308 ? 12.92 * channel : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

export function oklchToHex(lightness: number, chroma: number, hueDeg: number): string {
  const hue = (hueDeg * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return `#${toHexPair(gamma(red))}${toHexPair(gamma(green))}${toHexPair(gamma(blue))}`;
}
