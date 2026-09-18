/**
 * Metro, wired for the monorepo.
 *
 * `@kp/core` and `@kp/shared` are published as raw TypeScript — no build step,
 * the same way the Nuxt apps consume them. Metro will happily transpile that,
 * but only for files inside a watched folder, so the workspace root has to be
 * watched or every shared import fails to resolve.
 *
 * NativeWind v5 needs no Babel preset: styling runs through Metro and the
 * react-native-css engine instead. That is its main departure from v4.
 */
const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

// pnpm keeps the real packages in the root store and symlinks them in, so both
// locations have to be searched.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Hierarchical lookup stays ON. It is usually disabled in an npm/yarn monorepo
// to stop a second React resolving from the root, but pnpm already isolates
// every package — and turning it off breaks transitive resolution instead:
// reanimated's own `semver` lives inside its .pnpm directory, and without the
// upward walk Metro cannot find it ("Unable to resolve module
// semver/functions/satisfies").

module.exports = withNativewind(config);
