/**
 * The pre-paint theme script lives inline in every app's index.html, and has to
 * be the same script in each.
 *
 * It cannot be imported: anything the bundler touches arrives after first
 * paint, which is the one thing this script exists to beat. So it is a copy,
 * and a copy nobody checks is a copy that drifts — the same failure
 * `tokens:check` was added for. This fails the build when the blocks between
 * the `theme-preload` markers stop matching.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const FILES = ['apps/player/index.html', 'apps/admin/index.html'];
const START = '<!-- theme-preload:start -->';
const END = '<!-- theme-preload:end -->';

function block(file) {
  const src = readFileSync(join(root, file), 'utf8');
  const from = src.indexOf(START);
  const to = src.indexOf(END);
  if (from === -1 || to === -1) {
    console.error(`${file}: no ${START} … ${END} block.`);
    process.exit(1);
  }
  // Leading indentation is the file's business, not the script's.
  return src
    .slice(from + START.length, to)
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

const [first, ...rest] = FILES;
const expected = block(first);

for (const file of rest) {
  if (block(file) !== expected) {
    console.error(
      `${file}: the theme-preload block differs from ${first}.\n` +
        'Both apps must ship the same pre-paint script — copy one over the other.'
    );
    process.exit(1);
  }
}

console.log(`theme-preload identical across ${FILES.length} apps`);
