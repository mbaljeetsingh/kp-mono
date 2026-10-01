import { configDefaults, defineConfig } from 'vitest/config';

// `pnpm test` stays a unit run that needs nothing but Node. The permission
// matrix (*.db.test.ts) needs a running Supabase stack, so it has its own
// config and its own command: `pnpm test:db` (vitest.db.config.ts).
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/*.db.test.ts'],
  },
});
