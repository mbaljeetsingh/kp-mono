// Narrow on purpose.
//
// Prettier already owns formatting and tsc already owns types, so a lint config
// that repeats either is noise someone will eventually switch off. What neither
// of them can see is the rules of hooks — and that is precisely where this
// codebase's bugs live: a store pushing status at 10Hz through selector
// subscriptions, refs mirrored into effects so a listener attached once does not
// go stale, and one deliberate dependency omission in the admin workbench that
// restarts a 70-minute file if it is ever "corrected".
//
// So: react-hooks, and the handful of type-aware rules that catch a real defect
// rather than a preference. A floating promise or a missing await is how audio
// silently fails to start.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    // Build output, native projects and generated files. `packages/aligner` is
    // Python.
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.expo/**',
      '**/node_modules/**',
      // Agent worktrees: checkouts of this repo, linted on their own branch.
      '.claude/**',
      'apps/mobile/ios/**',
      'apps/mobile/android/**',
      'packages/aligner/**',
      'supabase/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Build scripts and bundler configs run on Node, not in a browser or on a
    // device, and Metro's and Babel's are CommonJS by contract.
    files: ['**/*.{mjs,cjs}', '**/scripts/**', '**/*.config.js'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        require: 'readonly',
        module: 'writable',
        __dirname: 'readonly',
      },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // tsc's noUnusedLocals already reports these, and it does so with the
      // apps' real configs rather than this one. Two voices, one complaint.
      '@typescript-eslint/no-unused-vars': 'off',

      // Warn, not error, and deliberately so — these two are the React Compiler
      // advisories, and the ten they currently flag are all the same shape:
      // state reset in an effect when a dialog opens or a track changes, and
      // refs written in callbacks that an effect also reads. Each is a genuine
      // smell with a known fix (derive it, or remount on a `key`), and each fix
      // is a behaviour change in a flow that is verified by hand rather than by
      // a test. Erroring would mean either ten rushed refactors or ten
      // suppression comments, and the suppressions would outlive the reason.
      // They stay visible on every run instead; see Known gaps in
      // docs/architecture.md.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',

      // An underscore-prefixed catch binding is a deliberate discard; an `any`
      // in a .d.ts shim is not worth a rewrite.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  }
);
