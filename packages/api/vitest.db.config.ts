import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// The permission matrix runs against the LOCAL stack only: `pnpm db:start`,
// or the fresh one CI starts. It signs in as the seed accounts and writes
// (then deletes) fixture rows, so pointed anywhere else it would be wrong
// twice over — the remote project is read-only for anything but the owner.
//
// No skip when the stack is down. A security suite that quietly skips is the
// exact failure the matrix exists for: the trust escalation survived several
// commits because nothing asked. If the stack is unreachable this fails.

const root = fileURLToPath(new URL('../..', import.meta.url));

function localStack(): { url: string; key: string } {
  let out: string;
  try {
    out = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    throw new Error('The permission matrix needs the local Supabase stack: run `pnpm db:start`.');
  }
  const status = JSON.parse(out) as Record<string, string>;
  const url = status.API_URL;
  const key = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
  if (!url || !key) throw new Error('`supabase status` reported no API URL or publishable key.');
  return { url, key };
}

const { url, key } = localStack();
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
  throw new Error(`Refusing to run the permission matrix against ${url}: local stack only.`);
}

export default defineConfig({
  test: {
    include: ['src/**/*.db.test.ts'],
    // One stack, shared rows: files must not interleave.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    provide: { supabaseUrl: url, supabaseKey: key },
  },
});
