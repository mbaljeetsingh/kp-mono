/**
 * Babel, which this app did without until it needed to animate.
 *
 * NativeWind v5 needs no preset — styling runs through Metro and the
 * react-native-css engine, which is its main departure from v4 — so there was
 * nothing to configure and no config file.
 *
 * Reanimated is the exception. Its worklets are ordinary JavaScript functions
 * until a Babel plugin rewrites them to run on the UI thread, and without that
 * rewrite `useAnimatedStyle` and friends fail at runtime rather than at build
 * time. In Reanimated 4 the plugin moved out to react-native-worklets, and it
 * must stay last: it needs to see the code after every other transform.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    // Plain expo preset. NativeWind v5 wants no jsxImportSource — that was v4's
    // mechanism, and setting it here would reintroduce the transform v5
    // deliberately does without.
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};
