/// <reference types="react-native-css/types" />

// react-native-css adds `className` to the RN components but says nothing about
// the stylesheets themselves, and both kinds are imported here: `global.css`
// for its side effect, and the template's `*.module.css` for web-only class
// maps. One declaration covers both — a side-effect import simply ignores the
// default binding, and TS resolves `*.css` ahead of a narrower `*.module.css`.
declare module '*.css' {
  const classes: Record<string, string>;
  export default classes;
}

/** Metro resolves an imported font to the asset id `useFonts` takes. */
declare module '*.ttf' {
  const asset: number;
  export default asset;
}
