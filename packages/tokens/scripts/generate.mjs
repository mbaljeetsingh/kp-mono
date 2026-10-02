/**
 * Regenerate tokens-native.css and colors.ts from tokens.css.
 *
 * Two derived files, one source. The native CSS moves the dark values under
 * `prefers-color-scheme` because NativeWind has no <html> to hang a class on,
 * and colors.ts exists because React Native style props take values rather
 * than class names. Both are generated so they cannot drift from the palette.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'tokens.css'), 'utf8');

const themeStart = src.indexOf('@theme inline');
const themeInline = src.slice(themeStart, src.indexOf('\n}\n', themeStart) + 3);

/** The declarations inside the first `<selector> {` block at or after `from`. */
function body(selector, from = 0) {
  const start = src.indexOf(`\n${selector} {`, from);
  return src.slice(src.indexOf('{', start) + 1, src.indexOf('\n}\n', start));
}

// The light palette is the `:root` after `@theme inline`, not the one inside it.
const lightBody = body(':root', themeStart + themeInline.length);
const darkBody = body('.dark');

writeFileSync(
  join(root, 'tokens-native.css'),
  `/*
 * The same palette, for the Expo app. GENERATED — edit tokens.css instead.
 *
 * NativeWind has no <html> to hang a \`.dark\` class on, so the dark values
 * sit under \`prefers-color-scheme\` instead — the one form react-native-css
 * reads as the dark palette. It follows React Native's Appearance, which the
 * app's theme choice sets (apps/mobile/src/lib/theme.ts).
 */

${themeInline}
:root {${lightBody}
}

@media (prefers-color-scheme: dark) {
  :root {${darkBody.replace(/\n(?=.)/g, '\n  ')}
  }
}
`
);

const camel = (name) =>
  name
    .split('-')
    .map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w))
    .join('');

const pairs = (block) => [...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)];
const entries = (block) =>
  pairs(block)
    .map(([, k, v]) => `    ${camel(k)}: '${v}',`)
    .join('\n');

writeFileSync(
  join(root, 'colors.ts'),
  `/**
 * The palette as TypeScript. GENERATED — edit tokens.css instead.
 *
 * React Native style props take colours as values, not class names, so an icon
 * tint or a native option cannot read a CSS variable.
 *
 * Class names remain the way to style anything that takes one. This is only for
 * the props that cannot — and since the palette switches at runtime, read it
 * through the app's \`useColors()\`, never by picking one of these at import.
 */
export const palettes = {
  light: {
${entries(lightBody)}
  },
  dark: {
${entries(darkBody)}
  },
} as const;

export type Palette = (typeof palettes)['light' | 'dark'];
export type ColorToken = keyof Palette;
`
);

console.log(
  `tokens-native.css and colors.ts regenerated (${pairs(lightBody).length} light, ${pairs(darkBody).length} dark)`
);
