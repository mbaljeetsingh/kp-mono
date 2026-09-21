/**
 * Rewrite the `@/` aliases React Native Reusables generates into relative paths.
 *
 * The CLI writes `@/lib/utils` and `@/components/ui/text`, which shadcn projects
 * resolve through a tsconfig path. That alias cannot work here: Metro resolves
 * aliases globally, not per package, so `@/` inside this package would point at
 * whichever app is doing the bundling. Relative imports need no bundler config
 * and survive `rnr add` being run again.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../src/components/ui/', import.meta.url).pathname;
let changed = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
  const path = join(dir, file);
  const before = readFileSync(path, 'utf8');
  const after = before
    .replace(/from '@\/lib\/utils'/g, "from '../../lib/utils'")
    .replace(/from '@\/components\/ui\/([^']+)'/g, "from './$1'")
    .replace(/from '@\/lib\/([^']+)'/g, "from '../../lib/$1'");
  if (after !== before) {
    writeFileSync(path, after);
    changed += 1;
  }
}
console.log(`derelative: rewrote ${changed} file(s)`);
