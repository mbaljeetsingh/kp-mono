/**
 * Regenerate tokens-native.css and colors.ts from tokens.css.
 *
 * Two derived files, one source. The native CSS re-points :root at the dark
 * values because NativeWind has no <html> to hang a class on, and colors.ts
 * exists because React Native style props take values rather than class names.
 * Both are generated so they cannot drift from the palette.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'tokens.css'), 'utf8');

const themeStart = src.indexOf('@theme inline');
const themeInline = src.slice(themeStart, src.indexOf('\n}\n', themeStart) + 3);

const darkStart = src.indexOf('.dark {');
const darkBody = src.slice(src.indexOf('{', darkStart) + 1, src.indexOf('\n}\n', darkStart));

writeFileSync(
  join(root, 'tokens-native.css'),
  `/*
 * The same palette, for the Expo app. GENERATED — edit tokens.css instead.
 *
 * NativeWind has no <html> to hang a \`.dark\` class on, so the dark values —
 * which is what both surfaces show by default — are applied to :root directly.
 *
 * A light mode on the phone is a later step: it needs NativeWind's colorScheme
 * wired to the same choice the web toggle writes, not a second copy of these.
 */

${themeInline}
:root {${darkBody}
}
`
);

const camel = (name) =>
  name
    .split('-')
    .map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w))
    .join('');

const pairs = [...darkBody.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)];

writeFileSync(
  join(root, 'colors.ts'),
  `/**
 * The palette as TypeScript. GENERATED — edit tokens.css instead.
 *
 * React Native style props take colours as values, not class names, so an icon
 * tint or a native option cannot read a CSS variable.
 *
 * Class names remain the way to style anything that takes one. This is only for
 * the props that cannot.
 */
export const colors = {
${pairs.map(([, k, v]) => `  ${camel(k)}: '${v}',`).join('\n')}
} as const;

export type ColorToken = keyof typeof colors;
`
);

console.log(`tokens-native.css and colors.ts regenerated (${pairs.length} colours)`);
